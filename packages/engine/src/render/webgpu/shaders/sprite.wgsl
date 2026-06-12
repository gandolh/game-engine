// sprite.wgsl — instanced sprite pipeline (Wave 1c, extended brief 16)
//
// Bind group layout:
//   group(0) binding(0) : ViewUniform (set once per pass by the orchestrator / GpuContext)
//   group(1) binding(0) : texture_2d<f32>  — atlas sheet
//   group(1) binding(1) : sampler          — nearest, clamp-to-edge
//
// Per-instance buffer byte layout (Float32, stride = 16 × 4 = 64 bytes):
//   [ 0] x          f32  — world center X
//   [ 1] y          f32  — world center Y (already z-lifted by orchestrator)
//   [ 2] w          f32  — world width
//   [ 3] h          f32  — world height
//   [ 4] u0         f32  — atlas UV left
//   [ 5] v0         f32  — atlas UV top
//   [ 6] u1         f32  — atlas UV right
//   [ 7] v1         f32  — atlas UV bottom
//   [ 8] rotation   f32  — radians, CCW
//   [ 9] flipX      f32  — 0.0 = normal, 1.0 = flip
//   [10] r          f32  — tint red   (0..1)
//   [11] g          f32  — tint green (0..1)
//   [12] b          f32  — tint blue  (0..1)
//   [13] a          f32  — sprite alpha (0..1; the tintRgba alpha byte is dropped
//                          by the CPU packer, matching Canvas2D's rgb-only multiply)
//   [14] sway_phase f32  — per-sprite phase offset for wind sway (radians)
//   [15] sway_amp   f32  — peak horizontal displacement at the sprite top (world px); 0 = rigid

// ── Uniforms ─────────────────────────────────────────────────────────────────

struct ViewUniform {
    scale_x      : f32,
    scale_y      : f32,
    offset_x     : f32,
    offset_y     : f32,
    // Wall-clock time in seconds — drives per-instance foliage wind sway.
    time_sec     : f32,
    // Global wind-strength multiplier (1.0 = full, 0.0 = rigid). Animated by the
    // renderer for whole-map gust waves. Fields [6..7] are padding (32-byte buffer).
    wind_strength : f32,
}

@group(0) @binding(0) var<uniform> view : ViewUniform;

// ── Atlas texture + sampler ───────────────────────────────────────────────────

@group(1) @binding(0) var atlas_texture : texture_2d<f32>;
@group(1) @binding(1) var atlas_sampler : sampler;

// ── Per-instance data (vertex-stepped) ───────────────────────────────────────

struct InstanceIn {
    @location(0) pos        : vec2<f32>,   // (x, y) world center
    @location(1) size       : vec2<f32>,   // (w, h)
    @location(2) uv_min     : vec2<f32>,   // (u0, v0)
    @location(3) uv_max     : vec2<f32>,   // (u1, v1)
    @location(4) rotation   : f32,
    @location(5) flip_x     : f32,
    @location(6) tint       : vec4<f32>,   // (r, g, b, a)
    @location(7) sway_phase : f32,         // per-sprite phase offset (radians)
    @location(8) sway_amp   : f32,         // peak top-edge displacement (world px); 0 = rigid
}

// ── Vertex output ─────────────────────────────────────────────────────────────

struct VertexOut {
    @builtin(position) clip_pos : vec4<f32>,
    @location(0)       uv       : vec2<f32>,
    @location(1)       tint     : vec4<f32>,
}

// ── Vertex shader ─────────────────────────────────────────────────────────────
//
// Quad corners in local space (index 0..3):
//   0 = top-left     (-0.5w, -0.5h)
//   1 = top-right    (+0.5w, -0.5h)
//   2 = bottom-left  (-0.5w, +0.5h)
//   3 = bottom-right (+0.5w, +0.5h)
//
// Draw call: draw(6, instanceCount) with triangle-list (two tris per quad):
//   tri 0: verts 0,1,2   tri 1: verts 1,3,2

@vertex
fn vs_main(
    @builtin(vertex_index) vertex_index : u32,
    inst : InstanceIn,
) -> VertexOut {
    // Map vertex index to quad corner
    // Two triangles: [0,1,2] and [1,3,2]
    let corner_idx = array<u32, 6>(0u, 1u, 2u, 1u, 3u, 2u)[vertex_index];

    // Corner offsets in local space: (±0.5, ±0.5)
    let lx_sign = select(-1.0, 1.0, (corner_idx & 1u) != 0u);   // 0,2→-1  1,3→+1
    let ly_sign = select(-1.0, 1.0, (corner_idx & 2u) != 0u);   // 0,1→-1  2,3→+1

    var local_x = lx_sign * inst.size.x * 0.5;
    let local_y = ly_sign * inst.size.y * 0.5;

    // flipX: mirror the local X axis
    local_x *= select(1.0, -1.0, inst.flip_x > 0.5);

    // Wind sway (brief 16): horizontal shear about the sprite's base.
    // Only TOP vertices are displaced (ly_sign < 0); bottom stays planted.
    // sway_amp == 0 → displacement is exactly 0 (multiply path, no FP drift on rigid structures).
    // wind_strength is the global gust multiplier (1.0 = full, 0.0 = all rigid).
    // The shear factor is 1 at the top edge (ly_sign = -1) and 0 at the bottom (ly_sign = +1).
    let sway_factor = max(0.0, -ly_sign);
    let sway_disp   = inst.sway_amp * view.wind_strength * sin(view.time_sec + inst.sway_phase) * sway_factor;
    local_x += sway_disp;

    // 2×2 rotation matrix
    let cos_r = cos(inst.rotation);
    let sin_r = sin(inst.rotation);
    let rotated_x = cos_r * local_x - sin_r * local_y;
    let rotated_y = sin_r * local_x + cos_r * local_y;

    // World position
    let world_x = rotated_x + inst.pos.x;
    let world_y = rotated_y + inst.pos.y;

    // World → clip space using the canonical view uniform (already folded by the orchestrator):
    //   scaleX  =  sx * 2 / canvasW         scaleY  = -sy * 2 / canvasH  (negative Y-flip)
    //   offsetX =  ox * 2 / canvasW - 1     offsetY =  1 - oy * 2 / canvasH
    // Shader does ONLY: clipX = worldX * scaleX + offsetX
    //                   clipY = worldY * scaleY + offsetY  (scaleY is negative — no extra negation)
    // (Wave 2 reconciliation: removed the erroneous extra *2-1 that Wave 1c applied in-shader.)
    let nx = world_x * view.scale_x + view.offset_x;
    let ny = world_y * view.scale_y + view.offset_y;

    // Interpolate atlas UVs across the quad corners
    let u = select(inst.uv_min.x, inst.uv_max.x, (corner_idx & 1u) != 0u);
    let v = select(inst.uv_min.y, inst.uv_max.y, (corner_idx & 2u) != 0u);

    var out : VertexOut;
    out.clip_pos = vec4<f32>(nx, ny, 0.0, 1.0);
    out.uv       = vec2<f32>(u, v);
    out.tint     = inst.tint;
    return out;
}

// ── Fragment shader ───────────────────────────────────────────────────────────
//
// Sample atlas (straight alpha from the texture), multiply RGB by tint RGB,
// multiply alpha by tint.a, then convert to premultiplied alpha for output.
// With nearest sampling this reproduces the Canvas2D tint multiply without an
// offscreen: transparent padding pixels stay transparent (texColor.a == 0
// → rgb * a == 0 regardless of tint).
//
// Output format: premultiplied alpha
//   out.rgb = straight_rgb * tint.rgb * total_alpha
//   out.a   = total_alpha
// where total_alpha = texColor.a * tint.a

@fragment
fn fs_main(in : VertexOut) -> @location(0) vec4<f32> {
    let tex_color = textureSample(atlas_texture, atlas_sampler, in.uv);

    // Tint multiply (straight alpha space)
    let rgb   = tex_color.rgb * in.tint.rgb;
    let alpha = tex_color.a   * in.tint.a;

    // Convert to premultiplied alpha for the blend equation:
    //   srcFactor=one, dstFactor=one-minus-src-alpha
    return vec4<f32>(rgb * alpha, alpha);
}
