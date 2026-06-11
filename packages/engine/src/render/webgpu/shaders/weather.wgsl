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

struct StreakInstance {
    @location(0) p0 : vec2<f32>,   // (x0, y0)
    @location(1) p1 : vec2<f32>,   // (x1, y1)
    @location(2) w  : f32,         // half-width world px
}

struct VertexOut {
    @builtin(position) clip_pos : vec4<f32>,
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

    // Which endpoint: corner 0,1 → p0; corner 2,3 → p1
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

    var out : VertexOut;
    out.clip_pos = vec4<f32>(nx, ny, 0.0, 1.0);
    return out;
}

// ── Snow flake vertex shader ──────────────────────────────────────────────────
//
// Builds a square quad centered at (cx, cy) with half-size h.
// Same two-triangle layout as particle.wgsl: draw(6, N).
//
//   corner 0 = top-left      corner 1 = top-right
//   corner 2 = bottom-left   corner 3 = bottom-right

struct SnowInstance {
    @location(0) center   : vec2<f32>,  // (cx, cy) — includes sway, world px
    @location(1) half_size: f32,        // half-size world px
}

@vertex
fn vs_snow(
    @builtin(vertex_index) vertex_index : u32,
    inst : SnowInstance,
) -> VertexOut {
    // Two triangles: [0,1,2] and [1,3,2]
    let corner_idx = array<u32, 6>(0u, 1u, 2u, 1u, 3u, 2u)[vertex_index];

    let lx_sign = select(-1.0, 1.0, (corner_idx & 1u) != 0u);  // 0,2 → -1  1,3 → +1
    let ly_sign = select(-1.0, 1.0, (corner_idx & 2u) != 0u);  // 0,1 → -1  2,3 → +1

    let world_x = inst.center.x + lx_sign * inst.half_size;
    let world_y = inst.center.y + ly_sign * inst.half_size;

    let nx = world_x * view.scale_x + view.offset_x;
    let ny = world_y * view.scale_y + view.offset_y;

    var out : VertexOut;
    out.clip_pos = vec4<f32>(nx, ny, 0.0, 1.0);
    return out;
}

// ── Fragment shader ───────────────────────────────────────────────────────────
//
// The curtain alpha is applied uniformly across all instances in one draw call
// (= RainField.curtainAlpha = the globalAlpha Canvas-2D uses).
//
// Output is premultiplied:
//   out.rgb = color.rgb * curtain_alpha
//   out.a   = curtain_alpha
// Blend equation (srcFactor=one, dstFactor=one-minus-src-alpha) composites
// correctly over whatever is underneath.

@fragment
fn fs_main(in : VertexOut) -> @location(0) vec4<f32> {
    let a = weather.curtain_alpha;
    // Premultiply: multiply RGB by alpha so the blend eq works correctly.
    return vec4<f32>(weather.color * a, a);
}
