/**
 * Material → flat-shading Apollo ramp for the mesh renderer.
 *
 * Each material picks adjacent steps on ONE Apollo ramp so every face of a solid
 * reads as a single material lit from above-front. The renderer quantizes a
 * triangle's face normal onto three brightness steps:
 *   top   = brightest (up-facing / sky),
 *   left  = mid       (the +y / south-facing direction),
 *   right = darkest   (the +x / east-facing direction, in shade),
 * plus an `outline` — a dark Apollo step used for the 1px silhouette + crease
 * edges (IsoVoxel-style readability).
 *
 * Every colour is a `CITADEL_PAL` role name (an Apollo value), so there are NO
 * hex literals and the palette guard passes by construction.
 */
import { CITADEL_PAL as EDG } from "../../citadel-palette";
import { rgbOf } from "@engine/core";
import type { MaterialKey } from "./types";

/** Opaque RGBA tuple for an EDG (Apollo) role hex. */
export type Rgba = readonly [number, number, number, number];

function rgba(hex: string): Rgba {
  const [r, g, b] = rgbOf(hex);
  return [r, g, b, 255];
}

/** The three lit brightness steps + the outline step for one material. */
export interface FaceTones {
  readonly top: Rgba;
  readonly left: Rgba;
  readonly right: Rgba;
  readonly outline: Rgba;
  /**
   * Materials that EMIT light rather than reflect it (a lamplit window pane, a
   * hot ember) don't darken by which way they face. When set, the renderer
   * fills every visible tri with `top` regardless of face normal — `left`/
   * `right` are unused but kept equal to `top` so the type stays uniform and a
   * caller can't observe an unquantized material by accident. `outline` still
   * applies normally.
   */
  readonly emissive?: true;
}

/**
 * The material palette. Luminance ordering top > left > right, darker outline.
 * Typed as `Record<MaterialKey, FaceTones>` (not `satisfies`) so every entry —
 * including the ones that omit `emissive` — widens to the full `FaceTones`
 * shape; that keeps `tones.emissive` a valid read at every access site instead
 * of only on the (as-written) literal union of entries that set it.
 */
export const MATERIALS: Record<MaterialKey, FaceTones> = {
  // Cream half-timbered walls — the browns' light end.
  plaster: { top: rgba(EDG.cream), left: rgba(EDG.skin), right: rgba(EDG.skinMid), outline: rgba(EDG.bark) },
  // Structural oak timber (legs, framing) — mid browns.
  timber: { top: rgba(EDG.skin), left: rgba(EDG.wood), right: rgba(EDG.woodDark), outline: rgba(EDG.bark) },
  // Darker heavy timber (a raised deck).
  darkwood: { top: rgba(EDG.wood), left: rgba(EDG.woodDark), right: rgba(EDG.bark), outline: rgba(EDG.black) },
  // Warm terracotta tile roof — the red/orange ramp.
  tile: { top: rgba(EDG.orange), left: rgba(EDG.rust), right: rgba(EDG.red), outline: rgba(EDG.crimson) },
  // Neutral cut stone (chimneys, cabins) — the grey ramp.
  stone: { top: rgba(EDG.silver), left: rgba(EDG.steel), right: rgba(EDG.slate), outline: rgba(EDG.navy) },
  // A hot clay bread-oven dome — gold → clay → woodDark.
  oven: { top: rgba(EDG.gold), left: rgba(EDG.clay), right: rgba(EDG.woodDark), outline: rgba(EDG.bark) },
  // Mossy green roof (healer) — the foliage ramp.
  greenroof: { top: rgba(EDG.green), left: rgba(EDG.greenMid), right: rgba(EDG.greenDark), outline: rgba(EDG.teal) },
  // Red signal cloth — banners, awnings, the healer cross — warm red ramp.
  signal: { top: rgba(EDG.rust), left: rgba(EDG.red), right: rgba(EDG.crimson), outline: rgba(EDG.bark) },
  // Deep-shadow excavated stone (quarry pit floor) — the dark neutral ramp.
  pit: { top: rgba(EDG.slate), left: rgba(EDG.navy), right: rgba(EDG.ink), outline: rgba(EDG.black) },
  // A dark, recessed window pane by day — cool neutral ramp so it reads as
  // glass/shadow set into the wall, not a hole punched through it.
  window: { top: rgba(EDG.slate), left: rgba(EDG.navy), right: rgba(EDG.ink), outline: rgba(EDG.black) },
  // Warm lamplight glowing through a window at dusk/night — EMISSIVE (flat gold
  // regardless of face normal), outlined in a warm dark rust rather than a cold
  // stone outline so the pane still reads warm at its edge.
  lampGlow: { top: rgba(EDG.gold), left: rgba(EDG.gold), right: rgba(EDG.gold), outline: rgba(EDG.rust), emissive: true },
  // A hotter ember glow for the smith's hearth at night — brighter than the
  // day "signal" ramp (the hearth's bright-mouth material) and EMISSIVE.
  hotEmber: { top: rgba(EDG.yellow), left: rgba(EDG.yellow), right: rgba(EDG.yellow), outline: rgba(EDG.crimson), emissive: true },
};
