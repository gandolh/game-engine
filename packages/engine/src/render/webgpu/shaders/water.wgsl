// water.wgsl — procedural animated water (brief 83 item-4 follow-up; brief 13 living-water upgrades)
//
// Covers the visible world rect with a procedural ocean surface. No hex color literals — all
// palette colors (deep / shallow / glint / foam / caustics) arrive as EDG-sourced uniforms
// from WaterPass; `time` is the wall-clock seconds for animation.
//
// Brief 13 additions (all palette-safe by construction):
//   Task 1 — REMOVED (was harmful for a procedural field). The original cell-hash tiling break
//             gave each water-tile-sized cell a random phase offset + X/Y flips. Because this
//             water is fully PROCEDURAL (the bound texture is unused), the long-wavelength ripple
//             sines (r1/r2, wavelengths >> cellSz) became DISCONTINUOUS at every cell border:
//             adjacent cells rendered different brightness of the same wave → blocky patchwork.
//             The noise-warp (Task 2) plus the incommensurate sine pair already prevent any
//             visible periodicity without introducing grid-aligned discontinuities.
//   Task 2 — Value-noise UV-warp: standard 2D bilinear value noise (~20 lines) drives a small
//             animated displacement of the world-position sample coordinate.
//   Task 3 — Quantized shore foam: step()-thresholded noise band at the depth boundary. EDG-white
//             at 2 quantized alpha levels (pixel-art friendly; no smooth gradients).
//   Task 4 — Voronoi caustics on the shallow band: 3×3-tile Voronoi distance field thresholded
//             to cell edges, drifted over time, masked to the depth band; EDG cyan/white at
//             quantized alpha. Composes UNDER the day/night tint (brief 12 TintPass).
//   Depth gradient (brief 13 follow-up) — the depth mask is now a wide 0..1 shore-proximity
//             gradient (GRADIENT_DEPTH_MAX=14 tiles, CPU-side), sampled LINEAR so the tile-
//             resolution mask interpolates smoothly. Base color blends toward shallowColor near
//             shore. Foam/caustics thresholds recalibrated to the new mask scale.
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
  left          : f32,
  top           : f32,
  right         : f32,
  bottom        : f32,
  scrollX       : f32,
  scrollY       : f32,
  swellAlpha    : f32,
  swellScrollX  : f32,
  swellScrollY  : f32,
  tileSize      : f32,
  useLinear     : f32,
  time          : f32,           // wall-clock seconds (animation phase)
  deepColor     : vec4<f32>,     // EDG deep-ocean
  shallowColor  : vec4<f32>,     // EDG sky/water blue (ripple crests)
  glintColor    : vec4<f32>,     // EDG cyan (sparkles)
  foamColor     : vec4<f32>,     // EDG white (shore foam — task 3)
  causticsColor : vec4<f32>,     // EDG cyan/white (caustics — task 4)
  worldWidthPx  : f32,           // full world width in pixels (for depth UV mapping)
  worldHeightPx : f32,           // full world height in pixels (for depth UV mapping)
  tilePx        : f32,           // tile size in world pixels (for depth UV mapping)
  _pad0         : f32,
}
@group(1) @binding(0) var<uniform> water : WaterUniform;

// Texture + samplers stay bound (the bind-group layout is shared) but are unused by the procedural path.
@group(1) @binding(1) var waterTexture  : texture_2d<f32>;
@group(1) @binding(2) var samplerNearest: sampler;
@group(1) @binding(3) var samplerLinear : sampler;

// Depth mask: 1-channel R8 texture (tilesX × tilesY). Each texel = depth/COAST_DEPTH_MAX in [0,1].
// 0 = no shallow band; 1 = adjacent to shore. Bound with clamp-to-edge (open ocean → 0).
@group(1) @binding(4) var depthMask     : texture_2d<f32>;
@group(1) @binding(5) var samplerDepth  : sampler;

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

// ── Hash helpers ─────────────────────────────────────────────────────────────────────────────────

// Cheap 2D value hash → [0,1). sin-based; good enough for sparse sparkle placement.
fn hash21(p: vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453);
}

// ── Value-noise helpers (task 2) ─────────────────────────────────────────────────────────────────
// Standard 2D bilinear value noise, Book of Shaders ch. 11 recipe, translated to WGSL.

fn noiseHash(p: vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453123);
}

fn valueNoise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let fr = fract(p);
  // Cubic Hermite interpolation (smoother than linear but no smooth gradient in pixel art sense;
  // kept because it avoids a harsh crease in the noise that would read as a seam at low zoom).
  let u = fr * fr * (3.0 - 2.0 * fr);
  let a = noiseHash(i + vec2<f32>(0.0, 0.0));
  let b = noiseHash(i + vec2<f32>(1.0, 0.0));
  let c2 = noiseHash(i + vec2<f32>(0.0, 1.0));
  let d = noiseHash(i + vec2<f32>(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c2, d, u.x), u.y);
}

// (Voronoi caustics helpers removed with the shore-FX pass — see fs_main.)

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
  let p = in.worldPos;
  let t = water.time;

  // ── Task 2: Value-noise UV-warp ───────────────────────────────────────────────────────────────
  // Bilinear value noise at a coarse scale, animated by time, displaces the sample coordinate
  // by a few pixels — turns the flat repeating scroll into visible low-frequency undulation.
  // Computed from plain world-space `p` (no per-cell hashing) so it is CONTINUOUS across the
  // whole ocean surface. Scale: 1 noise unit ≈ 80 world px (coarse); amplitude: ~3 px (subtle).
  let noiseScale = 1.0 / 80.0;
  let noiseAnim = t * 0.12;  // slow drift
  let nX = valueNoise(p * noiseScale + vec2<f32>(noiseAnim, 0.0));
  let nY = valueNoise(p * noiseScale + vec2<f32>(0.0, noiseAnim * 0.7));
  let warp = (vec2<f32>(nX, nY) - 0.5) * 6.0;   // ±3 world px
  let pWarped = p + warp;

  // ── Ripples (original logic, applied to warped + hashed coordinate) ──────────────────────────
  let r1 = sin(pWarped.x * 0.060 + pWarped.y * 0.028 + t * 0.90);
  let r2 = sin(pWarped.x * 0.017 - pWarped.y * 0.049 + t * 0.55);
  let ripple = (r1 + r2) * 0.5;   // [-1, 1]

  // ── Base color ────────────────────────────────────────────────────────────────────────────────
  let crest = clamp(0.22 + 0.22 * ripple + water.swellAlpha, 0.0, 1.0);
  var col = mix(water.deepColor.rgb, water.shallowColor.rgb, crest);

  // ── Glints (original logic, applied to warped + hashed coordinate) ───────────────────────────
  let cell2 = 22.0;
  let pg = pWarped + vec2<f32>(t * 3.5, t * 1.7);
  let glintId = floor(pg / cell2);
  let gh = hash21(glintId);
  let lit = step(0.93, gh);
  let tw = max(0.0, sin(t * 1.7 + gh * 40.0));
  let gLocal = fract(pg / cell2) - vec2<f32>(0.5, 0.5);
  let spark = smoothstep(0.34, 0.0, length(gLocal));
  let glint = lit * tw * spark * 0.85;
  col = mix(col, water.glintColor.rgb, glint);

  // Shore FX (depth-gradient blend, quantized foam, Voronoi caustics) intentionally removed:
  // the ocean is now a uniform deep tone modulated only by ripple + glint, with no shore awareness
  // (no near-shore shallow halo). The depth mask / shore uniforms remain bound but unused — dormant
  // plumbing, kept to avoid churning the WaterPass bind-group layout and render-loop drivers.

  // Opaque base (the world rect floor); premultiplied for canvas alphaMode = "premultiplied".
  return vec4<f32>(col, 1.0);
}
