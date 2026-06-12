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

// ── Voronoi helpers (task 4) ─────────────────────────────────────────────────────────────────────
// 3×3-tile Voronoi: returns distance to nearest cell point. Classic Book of Shaders ch. 12 recipe.

fn voronoiCellPt(cell: vec2<f32>, drift: vec2<f32>) -> vec2<f32> {
  // Per-cell random point in [0.15, 0.85]^2 so it stays near the cell center,
  // animated slowly by drift so the caustic pattern drifts over time.
  let h1 = hash21(cell + vec2<f32>(17.0, 0.0));
  let h2 = hash21(cell + vec2<f32>(0.0, 31.0));
  return cell + vec2<f32>(0.15 + 0.70 * h1, 0.15 + 0.70 * h2) + drift;
}

fn voronoiDist(p: vec2<f32>, drift: vec2<f32>) -> f32 {
  let cellP = floor(p);
  let fr = fract(p);
  var minDist = 8.0;
  for (var jj: i32 = -1; jj <= 1; jj++) {
    for (var ii: i32 = -1; ii <= 1; ii++) {
      let nb = cellP + vec2<f32>(f32(ii), f32(jj));
      let pt = voronoiCellPt(nb, drift);
      let d = distance(p, pt);
      if (d < minDist) { minDist = d; }
    }
  }
  return minDist;
}

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

  // ── Depth mask sample ─────────────────────────────────────────────────────────────────────────
  // Sample the wide shore-proximity gradient (GRADIENT_DEPTH_MAX=14 tiles, CPU-side).
  // UV = world-pixel position / world dimensions; LINEAR sampler interpolates sub-tile positions.
  // clamp-to-edge: out-of-range positions read 0 (open ocean, no shore effects).
  // depthSample: 1.0 = tile immediately adjacent to land; 0.0 = ≥14 tiles from land.
  let depthUV = p / vec2<f32>(water.worldWidthPx, water.worldHeightPx);
  let depthSample = textureSample(depthMask, samplerDepth, depthUV).r;

  // ── Organic shore field ───────────────────────────────────────────────────────────────────────
  // The raw bilinear sample of the tile-resolution mask has scalloped per-texel iso-contours
  // (classic bilinear artifact) — any threshold on it draws rows of tile-sized arcs. Perturb it
  // with two octaves of value noise BEFORE any use, so every shore-keyed boundary (gradient,
  // foam, caustics) follows one organic, continuous coastline. ±0.13 ≈ ±1.8 tiles of wobble;
  // the slow time drift makes the shore band breathe.
  let shoreNoise = (valueNoise(p * 0.045 + vec2<f32>(t * 0.040, t * 0.025)) - 0.5)
                 + (valueNoise(p * 0.012 + vec2<f32>(0.0, t * 0.020)) - 0.5) * 0.6;
  let shoreField = clamp(depthSample + shoreNoise * 0.16, 0.0, 1.0);

  // ── Shore-to-deep gradient ────────────────────────────────────────────────────────────────────
  // Blend the base color toward shallowColor near shore (high shoreField). The noise folded into
  // shoreField doubles as dither, so the wide gradient never bands.
  col = mix(col, water.shallowColor.rgb, shoreField * 0.45);

  // ── Task 3: Quantized shore foam ─────────────────────────────────────────────────────────────
  // Noise-based band right at the depth boundary, step()-quantized to 2 alpha levels (pixel-art).
  // Thresholds are calibrated to GRADIENT_DEPTH_MAX=14:
  //   old mask 0.70 (within ~1.2 tiles) → new ≈ (14-1.2)/14 ≈ 0.91
  //   old mask 0.40 (within ~2.4 tiles) → new ≈ (14-2.4)/14 ≈ 0.83
  // FOAM_NEAR: within ~1.2 tiles of shore; FOAM_FAR: within ~2.4 tiles.
  let FOAM_NEAR = 0.91;
  let FOAM_FAR  = 0.83;
  let foamNoise = valueNoise(p * 0.055 + vec2<f32>(t * 0.25, t * 0.18));
  // Level 1: strongest foam, closest to shore (gated on the organic shoreField, not the raw mask)
  let foam1 = step(FOAM_NEAR, shoreField) * step(0.62, foamNoise);
  // Level 2: lighter foam band slightly further out
  let foam2 = step(FOAM_FAR, shoreField) * step(0.68, foamNoise) * (1.0 - foam1);
  // Quantized alphas: 0 (none), 0.30 (light), 0.55 (strong).
  let foamAlpha = foam1 * 0.55 + foam2 * 0.30;
  col = mix(col, water.foamColor.rgb, foamAlpha);

  // ── Task 4: Voronoi caustics on the shallow band ─────────────────────────────────────────────
  // 3×3-tile Voronoi distance field thresholded to cell edges, masked to the depth band.
  // Scale: 1 Voronoi unit ≈ 32 world px (tile-sized cells); drift: slow time.
  // Caustics gate threshold calibrated to GRADIENT_DEPTH_MAX=14:
  //   old gate (mask > 0.01, within 4 tiles) → new ≈ step(0.72, depthSample) (within ~4 tiles).
  // CAUSTICS_GATE: within ~4 tiles of shore (= 1 - 4/14 ≈ 0.71, rounded up to 0.72).
  let CAUSTICS_GATE = 0.72;
  let causticScale = 1.0 / 32.0;
  let drift = vec2<f32>(t * 0.06, t * 0.04);
  let vd = voronoiDist(p * causticScale, drift);
  // Threshold to the cell edges: narrow band near edge (vd close to 0 = deep between cells,
  // vd near cell spacing = near edge). The caustic "lines" are at small vd values.
  // step()-quantize to 2 levels (pixel-art). Masked to depth band.
  let inDepth = step(CAUSTICS_GATE, shoreField);
  // Two quantized alpha levels for the caustic band.
  let caustic1 = step(0.72, vd) * inDepth;  // brightest caustic lines (near cell edge)
  let caustic2 = step(0.64, vd) * inDepth * (1.0 - caustic1);  // secondary ring
  let causticAlpha = caustic1 * 0.50 + caustic2 * 0.25;
  col = mix(col, water.causticsColor.rgb, causticAlpha);

  // Opaque base (the world rect floor); premultiplied for canvas alphaMode = "premultiplied".
  return vec4<f32>(col, 1.0);
}
