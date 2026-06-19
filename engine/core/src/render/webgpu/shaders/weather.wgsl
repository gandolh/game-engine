// weather.wgsl — GPU weather pass (Wave 4b)
//
// Bind group layout:
//   group(0) binding(0) : ViewUniform (set once per pass by the orchestrator / GpuContext)
//   group(1) binding(0) : WeatherUniform — per-draw color + curtain alpha
//
// There are two vertex entry points sharing one fragment entry point:
//   vs_streak  — builds an oriented thin quad (2 triangles) from a line segment instance
//   vs_snow    — builds a square quad from a center + half-size instance
//   fs_main    — outputs curtain color × curtain alpha, premultiplied
//
// ── Rain streak instance buffer (Float32, stride = 5 × 4 = 20 bytes) ──────────
//   [0] x0  f32  — streak head X (world px)
//   [1] y0  f32  — streak head Y (world px)
//   [2] x1  f32  — streak tail X (world px)
//   [3] y1  f32  — streak tail Y (world px)
//   [4] w   f32  — half-width of the quad in world px (≈ 0.35 so full width ≈ 0.7)
//
// ── Snow flake instance buffer (Float32, stride = 3 × 4 = 12 bytes) ──────────
//   [0] cx       f32  — center X (world px, includes sway)
//   [1] cy       f32  — center Y (world px)
//   [2] halfSize f32  — half-size (world px)
//
// View uniform (canonical convention, same as sprite.wgsl / particle.wgsl):
//   clipX = worldX * scale_x + offset_x
//   clipY = worldY * scale_y + offset_y
//   (scale_y is already negative for the Y-flip; NO extra *2-1 in the shader)

// ── Uniforms ──────────────────────────────────────────────────────────────────

struct ViewUniform {
    scale_x  : f32,
    scale_y  : f32,
    offset_x : f32,
    offset_y : f32,
}

@group(0) @binding(0) var<uniform> view : ViewUniform;

// WeatherUniform carries the per-draw curtain color (straight RGB, 0..1, parsed
// at runtime from the EDG color string — NO hex literals in source) and the
// curtain alpha (= RainField.curtainAlpha).
struct WeatherUniform {
    color        : vec3<f32>,   // RGB (0..1), parsed from EDG string by CPU
    curtain_alpha: f32,         // draw alpha (0..1)
}

@group(1) @binding(0) var<uniform> weather : WeatherUniform;

// ── Vertex output ─────────────────────────────────────────────────────────────
//
// local_uv   : 0..1 across the quad face (UV space, same convention as particle.wgsl)
// v_along    : 0 at streak head, 1 at streak tail (used for tail-taper alpha).
//              Always 0 for snow (unused by snow branch in fs_main).
// kind       : 0.0 = rain streak, 1.0 = snow flake
// variation  : per-instance hash [0..1] — drives size/alpha twinkle for snow,
//              unused for rain streaks.

struct VertexOut {
    @builtin(position) clip_pos  : vec4<f32>,
    @location(0)       local_uv  : vec2<f32>,
    @location(1)       v_along   : f32,   // 0 = head / top, 1 = tail / bottom
    @location(2)       kind      : f32,   // 0 = streak, 1 = snow
    @location(3)       variation : f32,   // per-instance hash [0..1]
}

// ── Rain streak vertex shader ─────────────────────────────────────────────────
//
// Builds a thin oriented quad from a line segment (x0,y0)→(x1,y1) and a
// half-width w.  The quad has 4 corners (2 triangles, draw(6, N)):
//
//   vertex_index: 0 1 2   1 3 2
//   corner:       A B D   B C D
//
//   A = p0 + perp*w    B = p0 - perp*w
//   C = p1 + perp*w    D = p1 - perp*w
//
// where perp is the unit vector perpendicular to (p1-p0).
//
// v_along:  corners 0,1 (at p0 = head) → 0.0;  corners 2,3 (at p1 = tail) → 1.0.
// The fragment shader uses smoothstep(0.0, 1.0, v_along) to taper alpha head→tail.

struct StreakInstance {
    @location(0) p0 : vec2<f32>,   // (x0, y0)
    @location(1) p1 : vec2<f32>,   // (x1, y1)
    @location(2) w  : f32,         // half-width world px
}

// ── Per-instance integer hash ─────────────────────────────────────────────────
// A single Murmur-style integer finalizer — maps any u32 to a pseudo-random u32.
// Bit-and to keep the value in u32 range; WGSL integer arithmetic wraps by spec.
fn hash_u32(val: u32) -> u32 {
    var h = val;
    h = h ^ (h >> 16u);
    h = h * 0x45d9f3bu;
    h = h ^ (h >> 16u);
    return h;
}

// Map a hashed u32 to a float in [0, 1).
fn hash_f32(val: u32) -> f32 {
    return f32(hash_u32(val)) / 4294967296.0;
}

@vertex
fn vs_streak(
    @builtin(vertex_index) vertex_index : u32,
    inst : StreakInstance,
) -> VertexOut {
    // Two triangles: [0,1,2] and [1,3,2]  →  corners A,B,D and B,C,D
    //   corner 0 = A  (+perp side, p0)
    //   corner 1 = B  (-perp side, p0)
    //   corner 2 = D  (-perp side, p1)
    //   corner 3 = C  (+perp side, p1)
    let corner_idx = array<u32, 6>(0u, 1u, 2u, 1u, 3u, 2u)[vertex_index];

    // Which endpoint: corner 0,1 → p0 (head); corner 2,3 → p1 (tail)
    let use_p1 = (corner_idx & 2u) != 0u;
    let center = select(inst.p0, inst.p1, use_p1);

    // Perpendicular to the segment direction (normalised)
    let dir = inst.p1 - inst.p0;
    let seg_len = length(dir);
    // Guard: avoid division by zero for degenerate (zero-length) streaks
    let seg_safe = select(vec2<f32>(0.0, 1.0), dir / seg_len, seg_len > 0.0001);
    // Perp: rotate 90 deg CCW
    let perp = vec2<f32>(-seg_safe.y, seg_safe.x);

    // corner 0,3 → +perp side;  corner 1,2 → -perp side
    let perp_sign = select(-1.0, 1.0, (corner_idx == 0u) || (corner_idx == 3u));
    let world = center + perp * (perp_sign * inst.w);

    let nx = world.x * view.scale_x + view.offset_x;
    let ny = world.y * view.scale_y + view.offset_y;

    // UV across the quad face (0..1): u across width, v along length head→tail
    let u_coord = select(0.0, 1.0, (corner_idx & 1u) != 0u);  // 0 = +perp, 1 = -perp
    let v_coord = select(0.0, 1.0, use_p1);                    // 0 = head,  1 = tail

    var out : VertexOut;
    out.clip_pos  = vec4<f32>(nx, ny, 0.0, 1.0);
    out.local_uv  = vec2<f32>(u_coord, v_coord);
    out.v_along   = v_coord;
    out.kind      = 0.0;  // rain streak
    out.variation = 0.0;  // unused for streaks
    return out;
}

// ── Snow flake vertex shader ──────────────────────────────────────────────────
//
// Builds a square quad centered at (cx, cy) with half-size h.
// Same two-triangle layout as particle.wgsl: draw(6, N).
//
//   corner 0 = top-left      corner 1 = top-right
//   corner 2 = bottom-left   corner 3 = bottom-right
//
// Per-instance variation (task 3): hash the instance_index to produce a
// pseudo-random float that the fragment shader uses for size/alpha twinkle.
// The size variation is applied here (smaller quad for dim flakes); alpha variation
// is applied in fs_main via the same `variation` value.

struct SnowInstance {
    @location(0) center   : vec2<f32>,  // (cx, cy) — includes sway, world px
    @location(1) half_size: f32,        // half-size world px (base, before variation)
}

@vertex
fn vs_snow(
    @builtin(vertex_index)   vertex_index   : u32,
    @builtin(instance_index) instance_index : u32,
    inst : SnowInstance,
) -> VertexOut {
    // Two triangles: [0,1,2] and [1,3,2]
    let corner_idx = array<u32, 6>(0u, 1u, 2u, 1u, 3u, 2u)[vertex_index];

    // Per-instance hash for size/alpha variation: range [0..1]
    let vari = hash_f32(instance_index);

    // Scale factor: 0.7 for the smallest flake, 1.0 for the largest.
    // This gives a visible spread in flake diameter without clipping the range.
    let scale = 0.7 + 0.3 * vari;
    let h = inst.half_size * scale;

    let lx_sign = select(-1.0, 1.0, (corner_idx & 1u) != 0u);  // 0,2 → -1  1,3 → +1
    let ly_sign = select(-1.0, 1.0, (corner_idx & 2u) != 0u);  // 0,1 → -1  2,3 → +1

    let world_x = inst.center.x + lx_sign * h;
    let world_y = inst.center.y + ly_sign * h;

    let nx = world_x * view.scale_x + view.offset_x;
    let ny = world_y * view.scale_y + view.offset_y;

    // UV 0..1 across the face (for the circle SDF in fs_main)
    let u_coord = select(0.0, 1.0, (corner_idx & 1u) != 0u);
    let v_coord = select(0.0, 1.0, (corner_idx & 2u) != 0u);

    var out : VertexOut;
    out.clip_pos  = vec4<f32>(nx, ny, 0.0, 1.0);
    out.local_uv  = vec2<f32>(u_coord, v_coord);
    out.v_along   = 0.0;     // unused for snow
    out.kind      = 1.0;     // snow flake
    out.variation = vari;    // per-flake hash for alpha twinkle in fs_main
    return out;
}

// ── Fragment shader ───────────────────────────────────────────────────────────
//
// Shared by both vs_streak and vs_snow entries.
//
// The curtain alpha is applied uniformly across all instances in one draw call
// (= RainField.curtainAlpha = the globalAlpha Canvas-2D uses).
//
// Rain streak (kind ≈ 0):
//   Alpha is tapered head→tail with smoothstep along v_along so the streak
//   reads as motion blur (bright leading edge, fading tail).  No discard —
//   the blend equation handles the fade-out cleanly.
//
// Snow flake (kind ≈ 1):
//   SDF-circle with fwidth() anti-aliasing (same recipe as particle.wgsl circle).
//   Per-flake variation modulates alpha for a twinkle effect.  Pixels outside
//   the circle are discarded.
//
// All effects modulate alpha/coverage of the pre-parsed EDG uniform color —
// no RGB is synthesised; no hex literals appear in this shader.
//
// Output is premultiplied:
//   out.rgb = color.rgb * total_alpha
//   out.a   = total_alpha
// Blend equation (srcFactor=one, dstFactor=one-minus-src-alpha) composites
// correctly over whatever is underneath.
//
// WGSL rule: fwidth() must be called from uniform control flow (never inside a
// data-dependent branch). Both SDFs are evaluated unconditionally; the result is
// then selected by `kind`. This matches the pattern in particle.wgsl.

@fragment
fn fs_main(in : VertexOut) -> @location(0) vec4<f32> {
    // ── Compute both shape coverages unconditionally (uniform control flow) ───
    //
    // Rain streak tail-taper: smoothstep 1.0→0.0 from head to tail.
    // Head = v_along 0, tail = v_along 1 → multiply curtain alpha by the taper.
    let streak_taper = 1.0 - smoothstep(0.0, 1.0, in.v_along);

    // Snow circle SDF (same recipe as particle.wgsl shapeId 0):
    //   d < 0 inside, d > 0 outside; soft edge via fwidth.
    let d_snow    = length(in.local_uv - vec2<f32>(0.5, 0.5)) - 0.5;
    let fw_snow   = fwidth(d_snow);
    let cov_snow  = clamp(1.0 - d_snow / max(fw_snow, 0.0001), 0.0, 1.0);

    // ── Select coverage by kind ──────────────────────────────────────────────
    //
    // kind == 0 → rain streak: full coverage (taper handled via alpha below).
    // kind == 1 → snow flake:  SDF circle coverage.
    let is_snow = in.kind > 0.5;
    let coverage = select(1.0, cov_snow, is_snow);

    // Discard for snow pixels outside the circle; streaks never discard.
    if is_snow && coverage <= 0.0 {
        discard;
    }

    // ── Final alpha ──────────────────────────────────────────────────────────
    //
    // Rain:  curtain_alpha × streak_taper (full coverage, tapered)
    // Snow:  curtain_alpha × coverage × per-flake variation [0.7..1.0] for twinkle
    let base_alpha = weather.curtain_alpha;

    // Snow per-flake alpha twinkle: [0.7..1.0] range so even dim flakes are visible.
    let snow_var_alpha = 0.7 + 0.3 * in.variation;

    let total_alpha = select(
        base_alpha * streak_taper,                      // rain
        base_alpha * coverage * snow_var_alpha,         // snow
        is_snow,
    );

    // Premultiply: multiply RGB by alpha so the blend eq works correctly.
    return vec4<f32>(weather.color * total_alpha, total_alpha);
}
