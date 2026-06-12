// water.wgsl — procedural animated water (brief 83 item-4 follow-up; replaces the tiled dot pattern)
//
// Covers the visible world rect with a procedural ocean surface: a gentle depth gradient that slowly
// undulates with scrolling sine ripples, plus sparse drifting glints. No texture sampling and no hex
// color literals — the three palette colors (deep / shallow / glint) arrive as EDG-sourced uniforms
// from WaterPass; `time` is the wall-clock seconds for animation. The near-shore shallows + grain are
// baked into the static layer on top (composited over this base).
//
// ViewUniform layout (group 0, binding 0) — folded world->clip coefficients (scaleY is NEGATIVE).
struct ViewUniform {
  scaleX  : f32,
  scaleY  : f32,
  offsetX : f32,
  offsetY : f32,
}
@group(0) @binding(0) var<uniform> view : ViewUniform;

// Per-draw quad + water params (group 1, binding 0). Colors are vec4 (rgb used; a ignored).
struct WaterUniform {
  left        : f32,
  top         : f32,
  right       : f32,
  bottom      : f32,
  scrollX     : f32,
  scrollY     : f32,
  swellAlpha  : f32,
  swellScrollX: f32,
  swellScrollY: f32,
  tileSize    : f32,
  useLinear   : f32,
  time        : f32,           // wall-clock seconds (animation phase)
  deepColor   : vec4<f32>,     // EDG deep-ocean
  shallowColor: vec4<f32>,     // EDG sky/water blue (ripple crests)
  glintColor  : vec4<f32>,     // EDG cyan (sparkles)
}
@group(1) @binding(0) var<uniform> water : WaterUniform;

// Texture + samplers stay bound (the bind-group layout is shared) but are unused by the procedural path.
@group(1) @binding(1) var waterTexture  : texture_2d<f32>;
@group(1) @binding(2) var samplerNearest: sampler;
@group(1) @binding(3) var samplerLinear : sampler;

struct VertexOut {
  @builtin(position) clipPos  : vec4<f32>,
  @location(0)       worldPos : vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VertexOut {
  let u = f32(vi & 1u);
  let v = f32((vi >> 1u) & 1u);
  let wx = water.left + u * (water.right  - water.left);
  let wy = water.top  + v * (water.bottom - water.top);
  var out: VertexOut;
  out.clipPos  = vec4<f32>(wx * view.scaleX + view.offsetX,
                           wy * view.scaleY + view.offsetY,
                           0.0, 1.0);
  out.worldPos = vec2<f32>(wx, wy);
  return out;
}

// Cheap 2D value hash → [0,1). sin-based; good enough for sparse sparkle placement.
fn hash21(p: vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453);
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
  let p = in.worldPos;
  let t = water.time;

  // ── Ripples: two scrolling sine waves at different angles/rates → a calm, non-repeating swell.
  let r1 = sin(p.x * 0.060 + p.y * 0.028 + t * 0.90);
  let r2 = sin(p.x * 0.017 - p.y * 0.049 + t * 0.55);
  let ripple = (r1 + r2) * 0.5;                       // [-1, 1]

  // ── Base: mostly deep ocean, lifting toward the sky-blue crest color at ripple peaks. The swell
  // alpha (slow global pulse from the render loop) nudges overall brightness a touch.
  let crest = clamp(0.22 + 0.22 * ripple + water.swellAlpha, 0.0, 1.0);
  var col = mix(water.deepColor.rgb, water.shallowColor.rgb, crest);

  // ── Glints: sparse cyan sparkles on a coarse cell grid, drifting slowly with the current and
  // twinkling over time. Only the top few % of cells ever sparkle; a soft round falloff (no squares).
  let cell = 22.0;
  let pg = p + vec2<f32>(t * 3.5, t * 1.7);           // drift the sparkle field with the current
  let id = floor(pg / cell);
  let h = hash21(id);
  let lit = step(0.93, h);                             // ~7% of cells (sparkle gate)
  let tw = max(0.0, sin(t * 1.7 + h * 40.0));          // twinkle, per-cell phase
  let local = fract(pg / cell) - vec2<f32>(0.5, 0.5);
  let spark = smoothstep(0.34, 0.0, length(local));    // soft round sparkle
  let glint = lit * tw * spark * 0.85;
  col = mix(col, water.glintColor.rgb, glint);

  // Opaque base (the world rect floor); premultiplied for canvas alphaMode = "premultiplied".
  return vec4<f32>(col, 1.0);
}
