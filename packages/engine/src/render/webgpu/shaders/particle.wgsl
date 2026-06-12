// particle.wgsl — instanced particle pipeline (Wave 4a / brief 14)
//
// Bind group layout:
//   group(0) binding(0) : ViewUniform (set once per pass by the orchestrator / GpuContext)
//
// No additional bind groups — colors arrive as per-instance attributes.
//
// Per-instance buffer byte layout (Float32, stride = 8 × 4 = 32 bytes):
//   [0] x       f32  — world center X
//   [1] y       f32  — world center Y
//   [2] size    f32  — radius (circle) or half-size (rect/star), world px
//   [3] shapeId f32  — 0.0 = circle, 1.0 = rect, 2.0 = star (8-point, polar method)
//   [4] r       f32  — red   (0..1, pre-normalised from 0..255 by CPU)
//   [5] g       f32  — green (0..1)
//   [6] b       f32  — blue  (0..1)
//   [7] alpha   f32  — opacity (0..1), = max(0, life/maxLife) from ParticleSystem
//
// View uniform (canonical convention, same as sprite.wgsl):
//   clipX = worldX * scale_x + offset_x
//   clipY = worldY * scale_y + offset_y
//   (scale_y is negative to flip Y; NO extra *2-1 in the shader)
//
// Shape rendering in the fragment shader:
//   shapeId 0 (circle): SDF — discard where length(uv - 0.5) > 0.5; alpha-fade in a 1-px
//                       ring at the edge for smooth circles.
//   shapeId 1 (rect):   Full unit quad — no discard.
//   shapeId 2 (star):   8-point star via polar radius modulation (brief 14, task 4).
//                       UV mapped to [-1,1]; inner radius is modulated by cos(4*theta)
//                       so 8 tips land at the cardinal and diagonal axes — matching the
//                       Canvas-2D drawStar() 8-point shape.
//
// Alpha fade-out (brief 14, task 5):
//   The per-instance linear alpha (life/maxLife) is eased with pow(alpha, 0.45) —
//   a concave curve that pushes bright brightness toward the start of a particle's life
//   so it appears to "pop" into existence and fade gently.  Short-lived sparks cross
//   the steep early part of the curve and then vanish; longer smoke/mist particles
//   linger visibly before dissolving.  Alpha-only — no RGB synthesised.

// ── Uniforms ──────────────────────────────────────────────────────────────────

struct ViewUniform {
    scale_x  : f32,
    scale_y  : f32,
    offset_x : f32,
    offset_y : f32,
}

@group(0) @binding(0) var<uniform> view : ViewUniform;

// ── Per-instance data (instance-stepped vertex buffer) ────────────────────────

struct InstanceIn {
    @location(0) center  : vec2<f32>,  // (x, y) world center
    @location(1) size    : f32,        // radius / half-size world px
    @location(2) shape_id: f32,        // 0=circle, 1=rect, 2=star
    @location(3) color   : vec4<f32>,  // (r, g, b, alpha) straight, 0..1
}

// ── Vertex output ─────────────────────────────────────────────────────────────

struct VertexOut {
    @builtin(position) clip_pos  : vec4<f32>,
    @location(0)       local_uv  : vec2<f32>,  // 0..1 across the quad face
    @location(1)       color     : vec4<f32>,  // (r, g, b, alpha) from instance
    @location(2)       shape_id  : f32,
}

// ── Vertex shader ─────────────────────────────────────────────────────────────
//
// Quad corners (triangle-list, draw(6, N)):
//   vertex_index: 0 1 2  1 3 2
//   corner_idx  : 0 1 2  1 3 2
//   0 = top-left   1 = top-right
//   2 = bottom-left 3 = bottom-right

@vertex
fn vs_main(
    @builtin(vertex_index) vertex_index : u32,
    inst : InstanceIn,
) -> VertexOut {
    // Map vertex index to corner index (two triangles: [0,1,2] and [1,3,2])
    let corner_idx = array<u32, 6>(0u, 1u, 2u, 1u, 3u, 2u)[vertex_index];

    // Corner offsets: ±0.5 in local space (before scaling by size)
    let lx_sign = select(-1.0, 1.0, (corner_idx & 1u) != 0u);  // 0,2 → -1  1,3 → +1
    let ly_sign = select(-1.0, 1.0, (corner_idx & 2u) != 0u);  // 0,1 → -1  2,3 → +1

    // Scale local offset by size*2 so the quad spans [-size..+size] in world px
    let world_x = inst.center.x + lx_sign * inst.size;
    let world_y = inst.center.y + ly_sign * inst.size;

    // World → clip space using the canonical view uniform convention.
    // scale_y is already negative (Y-flip baked in by the orchestrator), so
    // NO extra negation here.
    let nx = world_x * view.scale_x + view.offset_x;
    let ny = world_y * view.scale_y + view.offset_y;

    // local_uv: 0..1 across the face (top-left = (0,0), bottom-right = (1,1))
    let u = select(0.0, 1.0, (corner_idx & 1u) != 0u);
    let v = select(0.0, 1.0, (corner_idx & 2u) != 0u);

    var out : VertexOut;
    out.clip_pos = vec4<f32>(nx, ny, 0.0, 1.0);
    out.local_uv = vec2<f32>(u, v);
    out.color    = inst.color;
    out.shape_id = inst.shape_id;
    return out;
}

// ── Fragment shader ───────────────────────────────────────────────────────────
//
// Computes per-shape coverage from the quad's local UV (0..1), then outputs
// premultiplied alpha: (rgb * a, a).
//
// Shapes:
//   circle (0): SDF with a 1-px soft edge via fwidth() anti-aliasing.
//   rect   (1): Full quad — coverage = 1.0.
//   star   (2): 8-point star via polar radius modulation.
//               UV remapped to [-1,1] space; a pixel is inside when its distance
//               from the origin is <= the star's polar-modulated radius.  The
//               modulation is cos(4*theta) — 4 full periods over 2*pi give 8 tips.
//               Inner radius fraction = 0.45 (matches Canvas-2D drawStar ratio of
//               r_inner = r * 0.45).  Soft edge via fwidth().

@fragment
fn fs_main(in : VertexOut) -> @location(0) vec4<f32> {
    // WGSL requires derivative builtins (fwidth) to be called from UNIFORM control flow —
    // never inside a branch that depends on per-fragment varying data (here, shape_id).
    // So compute BOTH shapes' SDF coverage unconditionally (cheap ALU), then select by
    // shape below. This keeps every fwidth() call outside the data-dependent `if`.
    let d_circle = length(in.local_uv - vec2<f32>(0.5, 0.5)) - 0.5;
    let fw_circle = fwidth(d_circle);
    let cov_circle = clamp(1.0 - d_circle / max(fw_circle, 0.0001), 0.0, 1.0);

    // 8-point star (task 4): polar radius modulation.
    // Map UV to [-1,1] centered coordinates.
    let su = in.local_uv.x * 2.0 - 1.0;
    let sv = in.local_uv.y * 2.0 - 1.0;
    // Polar angle theta and radial distance from center.
    let theta   = atan2(sv, su);
    let rad     = length(vec2<f32>(su, sv));
    // Star radius at this angle: outer tip (1.0) and inner valley (0.45),
    // modulated by cos(4*theta) — 4 cycles = 8 tips.
    let star_r  = 0.725 + 0.275 * cos(4.0 * theta);  // range [0.45, 1.0]
    let d_star  = rad - star_r;
    let fw_star = fwidth(d_star);
    let cov_star = clamp(1.0 - d_star / max(fw_star, 0.0001), 0.0, 1.0);

    let shape = i32(round(in.shape_id));
    var coverage : f32 = 1.0;  // shape == 1 (rect): full quad
    if shape == 0 {
        coverage = cov_circle;
    } else if shape == 2 {
        coverage = cov_star;
    }

    if coverage <= 0.0 {
        discard;
    }

    // ── Alpha easing (task 5) ─────────────────────────────────────────────────
    // Apply a pow() curve to the per-instance linear alpha so particles fade with
    // a shaped decay rather than a flat ramp.  Exponent 0.45 is concave (< 1):
    // the particle is bright for most of its life and drops off quickly near death.
    // This makes sparks and glints "pop" visually without any per-kind branching.
    // Alpha-only — the RGB is left unchanged.
    let eased_alpha = pow(max(in.color.a, 0.0), 0.45);

    // Particle alpha = eased alpha × shape coverage
    let total_alpha = eased_alpha * coverage;

    // Output premultiplied alpha:
    //   out.rgb = straight_rgb * total_alpha
    //   out.a   = total_alpha
    // Blend equation (srcFactor=one, dstFactor=one-minus-src-alpha) then handles
    // compositing correctly.
    return vec4<f32>(in.color.rgb * total_alpha, total_alpha);
}
