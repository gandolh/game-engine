/**
 * Citadel sprite palette — every swatch is derived from an `EDG.*` constant via
 * `rgbOf`, so there are NO color literals here (no hex strings, no raw RGB
 * tuples). That keeps the EDG32 palette guard satisfied *by construction*: the
 * only way a color enters a recipe is through this map, and every entry is an
 * EDG color. A dedicated test (`palette.test.ts`) re-asserts this.
 *
 * Char convention (single chars so recipe rows stay readable):
 *   `.` transparent · lowercase ≈ base hue · uppercase ≈ a darker/related hue.
 * The unit silhouettes (`vil/person`, `raider`) are authored as a grey ramp
 * (`#`→`S`→`l`→`v`) so the per-instance state/strength tint *multiplies* into a
 * shaded colored figure (see `quads.ts`).
 */
import { CITADEL_PAL as EDG } from "../citadel-palette";
import { rgbOf } from "@engine/core";

/** `EDG.x` hex → opaque RGBA tuple. The single point where a color is realized. */
function rgba(hex: string): readonly [number, number, number, number] {
  const [r, g, b] = rgbOf(hex);
  return [r, g, b, 255];
}

/** Fully-transparent pixel. */
const NONE: readonly [number, number, number, number] = [0, 0, 0, 0];

/**
 * Swatch map: recipe char → RGBA. Covers a useful spread of the EDG32 set
 * (browns/clays for wood + roofs, greys for stone + the grey ramp, greens for
 * foliage/farm, blues/cyan for glass + water, gold/yellow/orange for accents +
 * fire, plum/mauve/salmon for special roofs, skin tones for figures).
 */
export const SWATCH: Readonly<Record<string, readonly [number, number, number, number]>> = {
  ".": NONE,

  // Darks / outlines
  "#": rgba(EDG.black),     // outline
  "%": rgba(EDG.bark),      // dark brown outline / shadow
  "i": rgba(EDG.ink),       // cool dark

  // Wood / thatch
  "w": rgba(EDG.wood),
  "W": rgba(EDG.woodDark),
  "t": rgba(EDG.tan),
  "c": rgba(EDG.cream),

  // Roofs (warm)
  "r": rgba(EDG.clay),
  "R": rgba(EDG.rust),
  "x": rgba(EDG.crimson),
  "e": rgba(EDG.red),

  // Fire / gold accents
  "o": rgba(EDG.orange),
  "O": rgba(EDG.gold),
  "y": rgba(EDG.yellow),

  // Foliage / farm
  "g": rgba(EDG.green),
  "G": rgba(EDG.greenMid),
  "d": rgba(EDG.greenDark),
  "T": rgba(EDG.teal),

  // Stone / metal / grey ramp
  "s": rgba(EDG.steel),
  "S": rgba(EDG.slate),
  "n": rgba(EDG.navy),
  "l": rgba(EDG.silver),
  "v": rgba(EDG.white),

  // Glass / water
  "b": rgba(EDG.blue),
  "B": rgba(EDG.skyBlue),
  "C": rgba(EDG.cyan),

  // Special roofs / banners
  "p": rgba(EDG.plum),
  "m": rgba(EDG.mauve),
  "P": rgba(EDG.salmon),

  // Figures
  "k": rgba(EDG.skin),
  "K": rgba(EDG.skinMid),
};

/** Resolve a recipe char to RGBA. Throws on an unknown char (authoring guard). */
export function colorOf(ch: string): readonly [number, number, number, number] {
  const c = SWATCH[ch];
  if (c === undefined) throw new Error(`citadel sprite palette: unknown swatch char "${ch}"`);
  return c;
}
