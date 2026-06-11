// particle.wgsl — instanced particle pipeline (Wave 4a)
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
//   [3] shapeId f32  — 0.0 = circle, 1.0 = rect, 2.0 = star (filled diamond approx)
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
//   shapeId 2 (star):   Filled diamond approximation (4-point star). The local UV is mapped
//                       to [-1,1] space; a pixel is inside when |u| + |v| <= 1 (L1 ball).
//                       This is a reasonable star silhouette with minimal ALU.
//                       NOTE: the Canvas-2D drawStar() draws an 8-point star; the GPU shape
//                       is intentionally a 4-point diamond as documented in the Wave 4a brief.

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
//   star   (2): Filled diamond (4-point star approximation) via L1 ball in [-1,1].
//               Pixel is inside when |su| + |sv| <= 1.  Alpha fade at the border.
//               This approximation was chosen for minimal ALU; the Canvas-2D path
//               uses an 8-point star but visual equivalence is not required here
//               (Wave 4a brief accepts "a reasonable approximation").

@fragment
fn fs_main(in : VertexOut) -> @location(0) vec4<f32> {
    var coverage : f32 = 1.0;

    let shape = i32(round(in.shape_id));

    if shape == 0 {
        // Circle SDF: center at (0.5, 0.5), radius 0.5
        let d = length(in.local_uv - vec2<f32>(0.5, 0.5)) - 0.5;
        // Soft discard: fade over ~1 fragment width
        let fw = fwidth(d);
        coverage = clamp(1.0 - d / max(fw, 0.0001), 0.0, 1.0);
    } else if shape == 2 {
        // Star / diamond: map UV from [0,1] to [-1,1]
        let su = in.local_uv.x * 2.0 - 1.0;
        let sv = in.local_uv.y * 2.0 - 1.0;
        let d_diamond = abs(su) + abs(sv) - 1.0;
        let fw = fwidth(d_diamond);
        coverage = clamp(1.0 - d_diamond / max(fw, 0.0001), 0.0, 1.0);
    }
    // shape == 1 (rect): coverage stays 1.0

    if coverage <= 0.0 {
        discard;
    }

    // Particle alpha = instance alpha × shape coverage
    let total_alpha = in.color.a * coverage;

    // Output premultiplied alpha:
    //   out.rgb = straight_rgb * total_alpha
    //   out.a   = total_alpha
    // Blend equation (srcFactor=one, dstFactor=one-minus-src-alpha) then handles
    // compositing correctly.
    return vec4<f32>(in.color.rgb * total_alpha, total_alpha);
}
