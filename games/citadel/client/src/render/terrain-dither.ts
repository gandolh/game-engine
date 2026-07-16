/**
 * Sub-tile terrain dither (brief 13) + terrain bake callback — pure,
 * deterministic, tested.
 *
 * Each terrain cell gets 1–3 small darker/lighter pixel clusters, chosen by a
 * pure integer hash of (tx, ty, type). No RNG, no Math.random — identical every
 * frame, never persisted to save data (it's a render-only bake decoration).
 *
 * Also owns `makeTerrainDecorate`: the static-layer bake callback that paints
 * the terrain grid and applies sub-tile dither clusters.
 */
import { CITADEL_PAL as EDG } from "./citadel-palette";
import type { Ctx2D } from "@engine/core";
import { TerrainType, TILE_SIZE } from "@citadel/sim-core";
import type { TerrainGrid } from "@citadel/sim-core";
import { TERRAIN_COLORS } from "./quads";
import type { TileWindow } from "./render-window";
import { ISO_HW, ISO_HH } from "./iso";
import type { IsoProjection } from "./iso";
import { landformHeight, hillshade, shadeBand } from "./hillshade";
import type { HeightSampler } from "./hillshade";

// ---------------------------------------------------------------------------
// makeTerrainDecorate (static-layer bake callback)
// ---------------------------------------------------------------------------

/**
 * Build the decorate callback that paints the terrain grid into the baked
 * static layer (a texture on the WebGPU backend). Each cell is a
 * TILE_SIZE×TILE_SIZE EDG-colored rect plus sub-tile dither.
 *
 * Tiles are always drawn in WORLD coordinates (`tx * TILE_SIZE`). For a windowed
 * sub-region bake (Citadel 21), the engine translates the bake ctx by -origin so
 * the world-coord fills land on the smaller texture — and passing `window` here
 * restricts the loop to just those tiles so a re-bake costs window-many fills,
 * not whole-grid-many. Omitting `window` paints the entire grid (byte-identical
 * to the whole-world bake).
 */
export function makeTerrainDecorate(
  iso: IsoProjection,
  grid: TerrainGrid,
  window?: TileWindow,
): (ctx: Ctx2D, wpx: number, hpx: number) => void {
  const minTx = window ? Math.max(0, window.minTx) : 0;
  const minTy = window ? Math.max(0, window.minTy) : 0;
  const maxTx = window ? Math.min(grid.width - 1, window.maxTx) : grid.width - 1;
  const maxTy = window ? Math.min(grid.height - 1, window.maxTy) : grid.height - 1;
  // ONE memoized heightfield sampler for the whole bake — the hillshade below
  // probes each cell's four neighbours, so a shared cache means every cell's
  // height (a handful of fBm octaves) is computed once, not up to five times.
  const sampler = makeHeightSampler(grid);
  return (ctx: Ctx2D): void => {
    // Paint each terrain cell as an ISO DIAMOND at its projected position, back
    // (top) to front (bottom) so a tiny diamond-edge overlap covers seams. The
    // bake canvas is the iso-world-px texture (origin 0,0), so tileToIso coords
    // land directly. Render-only.
    //
    // Tiles are baked FLAT (elevation 0). Citadel's tiles are flat gameplay-wise
    // and everything else — buildings, roads/bridges, the ghost, and the
    // `isoToTile` pick — lives at elevation 0, so a per-tile relief LIFT here
    // (which we used to apply) desynced the ground from all of them: lifted tiles
    // floated a road/bridge below their own terrain and opened dark seams at
    // elevation steps. Relief is therefore conveyed purely by VALUE (hillshading),
    // not geometry: a NW-lit shade of a heightfield derived from the terrain kind
    // (`hillshade.ts`) picks the darker/base/lighter EDG swatch per cell, so
    // ridges show a lit + shadowed face, shorelines fall into shade, and flats
    // stay even — the landform reads at a glance. The dither specks layer on top.
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        const t = grid.cells[ty * grid.width + tx] as TerrainType;
        const [top, right, bottom, left] = iso.tileDiamond(tx, ty) as [
          { x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number },
        ];
        // Hillshaded base fill: pick a darker/base/lighter EDG swatch by the cell's
        // NW-lit slope band (see `landformFill`) so the ground reads as shaped
        // relief. Fully on-palette (the dark/light come from DITHER_ACCENTS, all
        // EDG swatches); water stays its own shimmer hue (unbanded).
        ctx.fillStyle = landformFill(sampler, t, tx, ty);
        ctx.beginPath();
        ctx.moveTo(top.x, top.y);
        ctx.lineTo(right.x, right.y);
        ctx.lineTo(bottom.x, bottom.y);
        ctx.lineTo(left.x, left.y);
        ctx.closePath();
        ctx.fill();
        // Sub-tile dither: place the deterministic clusters around the diamond
        // centre (kept inside the diamond by scaling their tile-space offset to
        // the diamond's half extents).
        const c0 = iso.tileCenterToIso(tx, ty);
        for (const c of ditherClusters(tx, ty, t)) {
          // Map the cluster's in-tile (x,y)∈[0,TILE_SIZE) to a diamond-local
          // offset: shrink toward centre so specks stay on the diamond face.
          const fx = (c.x + c.size / 2) / TILE_SIZE - 0.5; // [-0.5,0.5]
          const fy = (c.y + c.size / 2) / TILE_SIZE - 0.5;
          const px = c0.x + fx * ISO_HW;
          const py = c0.y + fy * ISO_HH;
          ctx.fillStyle = c.hex;
          ctx.fillRect(Math.round(px), Math.round(py), c.size, c.size);
        }
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Sub-tile terrain dither
// ---------------------------------------------------------------------------

/**
 * Cheap pure integer coordinate hash → unsigned 32-bit int. Mixes tx, ty, type
 * with distinct odd multipliers + an xorshift finalizer so adjacent cells and
 * different types diverge. Self-contained (no sim dependency) by design.
 */
export function ditherHash(tx: number, ty: number, type: number): number {
  let h = (tx * 0x1f1f1f1f) ^ (ty * 0x8da6b343) ^ (type * 0xd2511f53);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Palette-snapped fBm relief (canonical value-noise + 3-octave fBm)
// ---------------------------------------------------------------------------
//
// This is the engine's canonical noise, ported CPU-side VERBATIM from
// `engine/core/src/render/webgpu/shaders/cloud.wgsl` (Book of Shaders ch.11/13,
// already tuned + shipped): `hash21`, cubic-Hermite `valueNoise`, 3-octave
// `fbm3`. It feeds the low-frequency tonal drift that makes the ground "breathe"
// — sampled per cell (deterministic on tx,ty) and step()-quantized to a handful
// of EDG shades, exactly like the shader's alpha tiers. It is a LOW-freq term
// LAYERED ON TOP OF the existing high-freq `(tx,ty,type)` dither clusters below.

/** cloud.wgsl `hash21`: 2D coord → pseudo-random float in [0,1). */
export function hash21(px: number, py: number): number {
  const s = Math.sin(px * 127.1 + py * 311.7) * 43758.5453;
  return s - Math.floor(s); // fract
}

/**
 * cloud.wgsl `valueNoise`: bilinear value noise with cubic-Hermite smoothing
 * (smoother than linear; avoids crease seams). Returns a smooth 0..1 value.
 */
export function valueNoise(px: number, py: number): number {
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const frx = px - ix;
  const fry = py - iy;
  // Cubic Hermite smoothing.
  const smx = frx * frx * (3 - 2 * frx);
  const smy = fry * fry * (3 - 2 * fry);
  const a = hash21(ix, iy);
  const b = hash21(ix + 1, iy);
  const c = hash21(ix, iy + 1);
  const d = hash21(ix + 1, iy + 1);
  // mix(mix(a,b,smx), mix(c,d,smx), smy)
  const top = a + (b - a) * smx;
  const bot = c + (d - c) * smx;
  return top + (bot - top) * smy;
}

/**
 * cloud.wgsl `fbm3`: 3 octaves of value noise, freq ×2 / amp ÷2 per octave,
 * normalized by 0.875 (0.5 + 0.25 + 0.125). Roughly [0,1]. Pure.
 */
export function fbm3(px: number, py: number): number {
  let val = 0;
  let amp = 0.5;
  let freq = 1.0;
  val += amp * valueNoise(px * freq, py * freq);
  amp *= 0.5; freq *= 2.0;
  val += amp * valueNoise(px * freq, py * freq);
  amp *= 0.5; freq *= 2.0;
  val += amp * valueNoise(px * freq, py * freq);
  return val / 0.875;
}

/**
 * Coarse elevation field in [0,1] for a terrain cell: a low-frequency 3-octave
 * `fbm3` sample so neighbouring cells share a smooth "height" that drifts in
 * large soft blobs (the fBm gives more organic, breathing variation than a
 * single value-noise octave did). The `ELEVATION_SCALE` divisor sets the
 * wavelength — larger = broader hills. 0 ≈ shaded valley, 1 ≈ sun-lit high
 * ground. Pure, render-only — never persisted, never touches the sim. This is
 * the palette-snapped fBm the ground fill quantizes against (see `elevationFill`).
 */
export const ELEVATION_SCALE = 11;

export function elevationField(tx: number, ty: number): number {
  // Clamp: fbm3 is nominally [0,1] but the normalized sum can graze slightly
  // outside; the callers (and tests) rely on a strict [0,1].
  const v = fbm3(tx / ELEVATION_SCALE, ty / ELEVATION_SCALE);
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** A darker + lighter EDG accent swatch per terrain type. */
export interface DitherAccents {
  /** Darker EDG swatch hex. */
  dark: string;
  /** Lighter EDG swatch hex. */
  light: string;
}

/**
 * Per-terrain-type dither accents: a darker and a lighter EDG swatch flanking
 * the base TERRAIN_COLORS hue. Covers every TerrainType. EDG-only.
 */
export const DITHER_ACCENTS: Record<TerrainType, DitherAccents> = {
  [TerrainType.Grass]: { dark: EDG.greenDark, light: EDG.green },
  [TerrainType.Water]: { dark: EDG.blue, light: EDG.cyan },
  [TerrainType.Forest]: { dark: EDG.teal, light: EDG.greenMid },
  // Stone: cozy-warm ramp — silver-lit highs, navy (not the near-black `ink`)
  // valleys. Per the style bible stone ramp (silver → slate → navy), keeping
  // the shadow a warm-tinted deep blue instead of collapsing to cold ink.
  [TerrainType.Stone]: { dark: EDG.navy, light: EDG.silver },
  // Rough (bare earth / sandy scrub): warm sun-baked ramp — `tan` highs over a
  // `woodDark` (warm brown) shadow, the earthy warmth the fidelity pass calls for.
  [TerrainType.Rough]: { dark: EDG.woodDark, light: EDG.tan },
};

const FALLBACK_ACCENTS: DitherAccents = { dark: EDG.ink, light: EDG.white };

/** Resolve the dither accents for a terrain type (pure, total). */
export function ditherAccents(type: TerrainType): DitherAccents {
  return DITHER_ACCENTS[type] ?? FALLBACK_ACCENTS;
}

// ---------------------------------------------------------------------------
// Hillshaded landform fill (the shaped-relief base, replaces flat elevation bands)
// ---------------------------------------------------------------------------

/**
 * The terrain KIND at (tx, ty), clamped to the grid edge so a neighbour probe at
 * the border reads the border cell (no wrap, no out-of-bounds). Pure.
 */
function terrainTypeAt(grid: TerrainGrid, tx: number, ty: number): TerrainType {
  const cx = tx < 0 ? 0 : tx >= grid.width ? grid.width - 1 : tx;
  const cy = ty < 0 ? 0 : ty >= grid.height ? grid.height - 1 : ty;
  return grid.cells[cy * grid.width + cx] as TerrainType;
}

/**
 * Build a memoized {@link HeightSampler} over a terrain grid: each cell's height
 * is `landformHeight(fBm-relief, terrain-kind)` (see `hillshade.ts`) — the fBm
 * rolling blended with the kind's pseudo-elevation, so water sits low (valleys /
 * shores) and stone high (ridges). Coordinates are edge-clamped, so the cache key
 * (the clamped grid index) dedupes border probes too. Pure; render-only.
 */
export function makeHeightSampler(grid: TerrainGrid): HeightSampler {
  const cache = new Map<number, number>();
  return (tx: number, ty: number): number => {
    const cx = tx < 0 ? 0 : tx >= grid.width ? grid.width - 1 : tx;
    const cy = ty < 0 ? 0 : ty >= grid.height ? grid.height - 1 : ty;
    const key = cy * grid.width + cx;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const h = landformHeight(elevationField(cx, cy), grid.cells[key] as TerrainType);
    cache.set(key, h);
    return h;
  };
}

/**
 * Base diamond fill for a cell, chosen by its HILLSHADE band: a NW-facing (lit)
 * slope takes the type's LIGHT accent, a SE-facing (shadowed) slope the DARK
 * accent, and locally-flat ground the base hue. Because the height that is shaded
 * folds in the terrain KIND (via {@link makeHeightSampler}), the shading traces
 * the map's real landforms — stone ridges get a lit + shadowed face, land draining
 * into a river/lake falls into shore-shadow, broad grass stays mostly base.
 *
 * Pure + on-palette (every branch is an EDG swatch from DITHER_ACCENTS / the base
 * TERRAIN_COLORS). Water is returned unbanded — its own shimmer reads as a flat
 * water surface, and hillshading a body of water would only add noise.
 */
export function landformFill(sampler: HeightSampler, type: TerrainType, tx: number, ty: number): string {
  const base = TERRAIN_COLORS[type] ?? EDG.green;
  if (type === TerrainType.Water) return base;
  const acc = ditherAccents(type);
  const band = shadeBand(hillshade(sampler, tx, ty));
  if (band < 0) return acc.dark;  // shadowed (SE-facing) slope
  if (band > 0) return acc.light; // lit (NW-facing) slope
  return base;                    // locally flat
}

/** A single dither cluster: a small filled square at (x,y) within the cell. */
export interface DitherCluster {
  /** X offset within the cell, px. */
  x: number;
  /** Y offset within the cell, px. */
  y: number;
  /** Square side length, px. */
  size: number;
  /** EDG accent hex (dark or light). */
  hex: string;
}

/**
 * Deterministically derive the 1–3 dither clusters for a cell from the pure
 * coordinate hash. Cluster count, positions (snapped to a 4px sub-grid so they
 * stay crisp at TILE_SIZE=16), sizes, and dark/light choice all come from
 * disjoint bit-fields of the hash → identical every call. Pure.
 *
 * CLUSTER-not-SPECKLE (cozy fidelity pass): each stamp is a chunky 2–3px block,
 * not a lone 1px pixel — the style bible wants "clusters over lone-pixel
 * speckle" so the ground reads as soft tonal blotches rather than TV static.
 * A single crisp 1px dot only survives on the sun-lit-high / deep-valley edges
 * where the tiny highlight/shadow accent still reads well.
 */
export function ditherClusters(tx: number, ty: number, type: TerrainType): DitherCluster[] {
  const accents = ditherAccents(type);
  const h = ditherHash(tx, ty, type);
  // Bias toward FEWER stamps (mostly 1) so the field reads as a calm surface
  // with occasional texture rather than dense noise when the map is zoomed out.
  const count = 1 + ((h & 0x7) === 0 ? 1 : 0) + ((h & 0x38) === 0 ? 1 : 0); // mostly 1, rarely 2-3
  const clusters: DitherCluster[] = [];
  // 4px sub-grid → 4 columns/rows of cells at TILE_SIZE=16, keeps stamps inset.
  const cells = TILE_SIZE / 4; // 4
  // Coarse elevation tilts the light/dark mix: sun-lit high ground gets more
  // light highlights, shaded low ground more dark clusters — a flat-2D echo of
  // tiny-world-builder's height-banded terrain. The threshold the per-cluster
  // bits race against slides with elevation (high elev → low threshold → almost
  // always light; low elev → high threshold → more dark).
  const elev = elevationField(tx, ty); // [0,1]
  const lightThreshold = Math.round(3 - elev * 3); // 3 (low) … 0 (high), over a 0..3 field
  for (let i = 0; i < count; i++) {
    // Each cluster consumes a fresh 8-bit slice of the hash.
    const slice = (h >>> (i * 8)) & 0xff;
    const gx = slice & 0x3; // 0..3 grid col
    const gy = (slice >>> 2) & 0x3; // 0..3 grid row
    // Chunky blobs: 2 or 3px (a cluster), biased to 2. Clamp against the tile
    // edge so a stamp near col/row 3 (base 12px) can't overrun 16px.
    let size = 2 + ((slice >>> 4) & 0x1); // 2..3 px cluster
    const baseX = gx * cells;
    const baseY = gy * cells;
    size = Math.min(size, TILE_SIZE - baseX, TILE_SIZE - baseY);
    // Elevation-biased light/dark choice — a 2-bit field (0..3) compared against
    // the elevation-derived threshold. Highs skew light, valleys skew dark.
    const light = ((slice >>> 5) & 0x3) >= lightThreshold;
    clusters.push({
      x: baseX,
      y: baseY,
      size,
      hex: light ? accents.light : accents.dark,
    });
  }
  return clusters;
}
