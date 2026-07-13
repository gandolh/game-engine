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
}

/** The material palette. Luminance ordering top > left > right, darker outline. */
export const MATERIALS = {
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
} satisfies Record<string, FaceTones>;
