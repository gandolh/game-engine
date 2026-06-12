// tint.wgsl — full-screen tint pass (brief 12)
//
// Composites a solid color wash over the scene using source-over blending.
// This is the GPU equivalent of:
//   ctx.globalAlpha = tint.alpha;
//   ctx.fillRect(0, 0, W, H);
//
// Result: out = mix(scene, washColor, washAlpha)
//   = scene * (1 - washAlpha) + washColor * washAlpha
// which is exactly what premultiplied source-over gives:
//   src = (washColor * washAlpha, washAlpha)
//   out.rgb = src.rgb + dst.rgb * (1 - src.a)
//   out.a   = src.a  + dst.a  * (1 - src.a)
//
// Bind group layout:
//   group(0) binding(0) : TintUniform — wash color (pre-parsed EDG RGB floats) + alpha
//
// No vertex buffer — the vertex shader generates a full-screen triangle from vertex_index:
//   vertex_index 0 → (-1, -1)
//   vertex_index 1 → ( 3, -1)   (off-screen right, covers the whole viewport)
//   vertex_index 2 → (-1,  3)   (off-screen bottom, covers the whole viewport)
// Three vertices make a triangle that covers the entire clip-space rectangle [-1,1]×[-1,1].

// ── Uniform ───────────────────────────────────────────────────────────────────

struct TintUniform {
    // RGB (0..1), parsed from EDG color string by CPU — never synthesized in WGSL.
    wash_color : vec3<f32>,
    // Composite alpha in [0,1].  Layout: f32 follows vec3 at offset 12 (tail padding).
    wash_alpha : f32,
}

@group(0) @binding(0) var<uniform> tint : TintUniform;

// ── Vertex shader — fullscreen triangle (no vertex buffer) ───────────────────

struct VertexOut {
    @builtin(position) clip_pos : vec4<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vtx : u32) -> VertexOut {
    // Three-vertex fullscreen triangle trick:
    //   vtx 0 → clip (-1, -1)   bottom-left
    //   vtx 1 → clip ( 3, -1)   far right (beyond viewport)
    //   vtx 2 → clip (-1,  3)   far bottom (beyond viewport)
    // The triangle covers [-1,1]×[-1,1] with no overdraw.
    let x = select(-1.0, 3.0, vtx == 1u);
    let y = select(-1.0, 3.0, vtx == 2u);
    var out : VertexOut;
    out.clip_pos = vec4<f32>(x, y, 0.0, 1.0);
    return out;
}

// ── Fragment shader ───────────────────────────────────────────────────────────
//
// Output is premultiplied so the blend equation
//   (srcFactor=one, dstFactor=one-minus-src-alpha)
// gives correct source-over compositing:
//   out.rgb = wash_color * wash_alpha + scene.rgb * (1 - wash_alpha)
//   out.a   = wash_alpha             + scene.a   * (1 - wash_alpha)

@fragment
fn fs_main(in : VertexOut) -> @location(0) vec4<f32> {
    let a = tint.wash_alpha;
    return vec4<f32>(tint.wash_color * a, a);
}
