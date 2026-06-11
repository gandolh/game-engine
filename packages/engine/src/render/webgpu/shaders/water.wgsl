// water.wgsl — tiling animated water pass
//
// Covers the visible world rect with a repeat-wrapped water tile.
// Supports a main scroll offset and an optional swell (second pass) blended on top.
// No hex color literals — all color comes from the sampled texture.
//
// ViewUniform layout (group 0, binding 0) — set once per frame by GpuContext.setView().
// GpuContext (Wave 1a) stores folded world->clip coefficients:
//   scaleX  =  sx * 2 / canvasW       (positive)
//   scaleY  = -sy * 2 / canvasH       (NEGATIVE — Y flip already baked in)
//   offsetX =  ox * 2 / canvasW - 1
//   offsetY =  1 - oy * 2 / canvasH
// Shader computes:  clipX = worldX * scaleX + offsetX
//                   clipY = worldY * scaleY + offsetY  ← scaleY is negative, no extra negation
struct ViewUniform {
  scaleX  : f32,
  scaleY  : f32,
  offsetX : f32,
  offsetY : f32,
}
@group(0) @binding(0) var<uniform> view : ViewUniform;

// Per-draw quad and water parameters (group 1, binding 0).
// All positions in world px; scroll offsets pre-wrapped to tile size by TypeScript.
struct WaterUniform {
  // Visible world rect corners (world px).
  left        : f32,
  top         : f32,
  right       : f32,
  bottom      : f32,
  // Main scroll offset (world px, pre-wrapped).
  scrollX     : f32,
  scrollY     : f32,
  // Swell pass: alpha and scroll offset.
  swellAlpha  : f32,
  swellScrollX: f32,
  swellScrollY: f32,
  // Tile size (world px). UV = (worldPos + scroll) / tileSize → tiling via repeat sampler.
  tileSize    : f32,
  // 1.0 → use bilinear sampler (zoomed out, sx < 1); 0.0 → nearest.
  useLinear   : f32,
  // Padding to align struct to 16-byte boundary (12 f32 = 48 bytes, already aligned).
  _pad        : f32,
}
@group(1) @binding(0) var<uniform> water : WaterUniform;

// Water tile texture and both sampler variants.
// Sampler address modes are set to repeat in TypeScript so UV wrapping is free.
@group(1) @binding(1) var waterTexture  : texture_2d<f32>;
@group(1) @binding(2) var samplerNearest: sampler;
@group(1) @binding(3) var samplerLinear : sampler;

// ---- Vertex shader ----
// Emits 4 vertices for a triangle-strip quad covering the visible world rect.
// Vertex index → corner: 0=TL, 1=TR, 2=BL, 3=BR.
struct VertexOut {
  @builtin(position) clipPos  : vec4<f32>,
  @location(0)       worldPos : vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VertexOut {
  let u = f32(vi & 1u);           // 0 → left, 1 → right
  let v = f32((vi >> 1u) & 1u);   // 0 → top,  1 → bottom

  let wx = water.left + u * (water.right  - water.left);
  let wy = water.top  + v * (water.bottom - water.top);

  var out: VertexOut;
  // scaleY is already negative (Y-flip baked in by GpuContext) — no extra negation needed.
  out.clipPos  = vec4<f32>(wx * view.scaleX + view.offsetX,
                           wy * view.scaleY + view.offsetY,
                           0.0, 1.0);
  out.worldPos = vec2<f32>(wx, wy);
  return out;
}

// ---- Fragment shader ----
// Compute UV in world space, scroll-shifted, sampled via repeat.
// Optionally blend a swell pass (second sample at a different offset) on top.
// Output is premultiplied alpha to match canvas alphaMode = "premultiplied".
@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
  let uv = (in.worldPos + vec2<f32>(water.scrollX, water.scrollY)) / water.tileSize;

  var base: vec4<f32>;
  if (water.useLinear > 0.5) {
    base = textureSample(waterTexture, samplerLinear,  uv);
  } else {
    base = textureSample(waterTexture, samplerNearest, uv);
  }

  // Swell: second sample blended on top with swellAlpha (mirrors Canvas2D globalAlpha pass).
  // Canvas2D does: source-over at globalAlpha=swellAlpha, so effective src alpha = swell.a * swellAlpha.
  // All blending here is in straight-alpha space; premultiply at the end.
  if (water.swellAlpha > 0.0) {
    let uvS = (in.worldPos + vec2<f32>(water.swellScrollX, water.swellScrollY)) / water.tileSize;
    var swell: vec4<f32>;
    if (water.useLinear > 0.5) {
      swell = textureSample(waterTexture, samplerLinear,  uvS);
    } else {
      swell = textureSample(waterTexture, samplerNearest, uvS);
    }
    // Effective coverage of the swell pixel.
    let sa = swell.a * water.swellAlpha;
    // source-over (straight-alpha): out_rgb = swell.rgb * sa + base.rgb * (1 - sa)
    //                                out_a   = sa + base.a * (1 - sa)
    base = vec4<f32>(
      swell.rgb * sa + base.rgb * (1.0 - sa),
      sa + base.a * (1.0 - sa),
    );
  }

  // Convert straight alpha → premultiplied alpha for the canvas (alphaMode = "premultiplied").
  return vec4<f32>(base.rgb * base.a, base.a);
}
