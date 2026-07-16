/**
 * Terrain HILLSHADE — pure, deterministic, render-only landform relief.
 *
 * ## Why this exists
 *
 * Citadel's sim terrain (`TerrainGrid`) is a flat field of {@link TerrainType}
 * cells: `cells`, `width`, `height` — and NOTHING ELSE. There is no elevation
 * channel in the sim data, and the sim never will grow one for a purely visual
 * feature (that would touch determinism). The previous terrain bake tinted the
 * ground by a client-side fBm noise (`elevationField` in `terrain-dither.ts`)
 * that was uncorrelated with the map's real features — so a river read no lower
 * than a hill, a stone vein no higher than grass, and a player could not tell a
 * valley from a ridge from the shading. It banded by ABSOLUTE height only, which
 * conveys "high vs low" weakly and conveys SHAPE (slope) not at all.
 *
 * This module derives a coherent HEIGHTFIELD purely from data the renderer
 * already has — the terrain KIND at each cell, plus the existing fBm rolling
 * relief — and HILLSHADES it: each cell is lit by a fixed north-west "sun", so a
 * slope facing the light reads bright and a slope facing away reads dark. The
 * result is the classic cartographic relief cue: ridges show a lit face and a
 * shadowed face, valleys and shorelines fall into shadow, flats stay even. That
 * is what makes a landform readable AT A GLANCE.
 *
 * NW light is not arbitrary: it matches the low-NW-sun convention the rest of
 * the Citadel render already commits to (`buildingShadowQuad`'s SE drop-shadow,
 * `SHADOW_OFFSET` "sun from the NW"), so ground relief and building shadows
 * agree on where the sun is.
 *
 * ## Contract
 *
 * Everything here is PURE and returns NUMBERS (a height, a signed shade, a band
 * index) — it maps NOTHING to color. `terrain-dither.ts` owns the numbers→EDG
 * swatch mapping (dark / base / light per terrain type), so the palette stays in
 * one place and this module carries no hex. No RNG, no `Date`, no sim mutation —
 * a bake decoration, never persisted, identical every call.
 */
import { TerrainType } from "@citadel/sim-core";

// ---------------------------------------------------------------------------
// Heightfield: terrain KIND → pseudo-elevation, blended with the fBm rolling
// ---------------------------------------------------------------------------

/**
 * Pseudo-elevation per terrain KIND, in [0,1] (0 = valley floor, 1 = high
 * ground). This is the honest signal: the map's real features carry the relief.
 *
 *   Water  — lowest. Rivers and lakes are the valley floors; the land draining
 *            into them then reads as shorelines (a lit / shadowed rim).
 *   Rough  — low scrub / badlands, sitting just above the water.
 *   Grass  — the neutral plain (mid). Flat country stays flat.
 *   Forest — wooded rises, a touch above the plain.
 *   Stone  — highest. Rocky veins read as raised ridges / crags.
 *
 * The ORDERING is the load-bearing part (water < rough < grass < forest < stone);
 * the exact values are tuned so stone clearly out-tops water while neighbouring
 * kinds stay close enough that the fBm undulation below still varies within a
 * band. Pure + total (covers every TerrainType).
 */
export const TERRAIN_RELIEF: Record<TerrainType, number> = {
  [TerrainType.Water]: 0.10,
  [TerrainType.Rough]: 0.35,
  [TerrainType.Grass]: 0.50,
  [TerrainType.Forest]: 0.62,
  [TerrainType.Stone]: 0.85,
};

/** Resolve a terrain kind's pseudo-elevation (pure, total; grass mid as fallback). */
export function terrainRelief(type: TerrainType): number {
  return TERRAIN_RELIEF[type] ?? 0.5;
}

/**
 * How much the terrain KIND drives the height vs. the fBm rolling noise. Kind
 * DOMINATES (0.6) so features read as coherent landforms — a stone ridge always
 * sits meaningfully above a river regardless of the noise — while the noise
 * (0.4) adds within-kind undulation so a broad grass plain still gently rolls
 * instead of reading as a dead-flat slab. The two weights sum to 1 so the output
 * stays in [0,1] without a clamp doing real work (the clamp is just a guard).
 */
export const KIND_WEIGHT = 0.6;
export const NOISE_WEIGHT = 0.4;

/**
 * Combine the fBm rolling height (`baseNoise` ∈ [0,1], the caller samples it from
 * `elevationField`) with the terrain kind's pseudo-elevation into one height in
 * [0,1]. Passing `baseNoise` in (rather than importing `elevationField` here)
 * keeps this module free of the noise implementation AND free of the import
 * cycle with `terrain-dither.ts` — that module owns the noise and the swatch
 * mapping and simply feeds us the scalar. Pure.
 */
export function landformHeight(baseNoise: number, type: TerrainType): number {
  const h = KIND_WEIGHT * terrainRelief(type) + NOISE_WEIGHT * baseNoise;
  return h < 0 ? 0 : h > 1 ? 1 : h;
}

// ---------------------------------------------------------------------------
// Hillshade: signed slope shading from a height sample (the pure, tested core)
// ---------------------------------------------------------------------------

/**
 * A height lookup over tile coordinates → height in [0,1]. The renderer builds
 * one over the terrain grid (with edge clamping + memoization); the tests pass a
 * synthetic ramp. Off-grid coordinates are the caller's concern (clamp/repeat).
 */
export type HeightSampler = (tx: number, ty: number) => number;

/**
 * Weight of the SLOPE (directional) term. Dominant, because the directional
 * lit/shadowed faces are what actually make relief read as 3-D shape.
 */
export const SLOPE_GAIN = 1.3;

/**
 * Weight of the ABSOLUTE-height (hypsometric) term — a gentle bias so high
 * ground trends a little lighter and low ground a little darker even where the
 * ground is locally flat (a high plateau still reads "high"). Kept well below
 * SLOPE_GAIN so it never overrides the shape read.
 */
export const HEIGHT_GAIN = 0.5;

/**
 * Signed hillshade for the cell (tx, ty) under a fixed NORTH-WEST sun.
 *
 *   > 0  the surface faces the light (rises toward the NW) → render LIGHTER.
 *   ≈ 0  flat, or facing across the light                  → render BASE.
 *   < 0  the surface faces away (rises toward the SE)      → render DARKER.
 *
 * Derivation: sample the local gradient with central differences —
 *   gx = h(x+1) − h(x−1)   (> 0 when the ground rises toward the EAST)
 *   gy = h(y+1) − h(y−1)   (> 0 when the ground rises toward the SOUTH)
 * A NW-facing surface rises toward the west (gx < 0) AND the north (gy < 0), so
 * `−(gx + gy)` is positive exactly when the cell faces the NW sun. We add the
 * mild hypsometric term `(h − 0.5)` so absolute height nudges the shade too.
 * Pure — a plain function of the sampled heights.
 */
export function hillshade(sample: HeightSampler, tx: number, ty: number): number {
  const hC = sample(tx, ty);
  const gx = sample(tx + 1, ty) - sample(tx - 1, ty);
  const gy = sample(tx, ty + 1) - sample(tx, ty - 1);
  const slopeLight = -(gx + gy);
  return SLOPE_GAIN * slopeLight + HEIGHT_GAIN * (hC - 0.5);
}

/** A quantized shade band: −1 shadowed (dark), 0 neutral (base), +1 lit (light). */
export type ShadeBand = -1 | 0 | 1;

/**
 * Threshold separating the neutral band from the lit / shadowed bands. Tuned so
 * locally-flat ground (slope ≈ 0, only the small hypsometric term in play) lands
 * in the BASE band — flats read flat — while the stronger shade at a feature
 * edge (a shoreline, a ridge flank) crosses into dark / light. Symmetric about 0.
 */
export const SHADE_BAND_THRESHOLD = 0.14;

/**
 * Quantize a signed hillshade into a 3-level band. Three levels because the
 * established terrain palette gives exactly a dark / base / light swatch per
 * terrain kind (see `DITHER_ACCENTS`), and a consistent NW-lit 3-tone shade is
 * enough to sell shaped relief without inventing tones. Pure.
 */
export function shadeBand(shade: number, threshold: number = SHADE_BAND_THRESHOLD): ShadeBand {
  if (shade > threshold) return 1;
  if (shade < -threshold) return -1;
  return 0;
}
