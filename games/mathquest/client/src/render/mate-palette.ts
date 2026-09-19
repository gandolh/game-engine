// MateQuest's palette: Resurrect-64 (by Kerrie Lake / Dawnbringer lineage's
// 64-colour successor), distinct from the engine's EDG32 (Farm + engine) and
// Citadel/Hollow's Apollo-46.
//
// sweep-02: the 64-swatch RESURRECT64 list and the nearest-swatch search used
// to be hand-maintained here as a second copy of the engine-side scan list,
// with nothing asserting the two agreed. A palette is data, not a game, so
// RESURRECT64 and the generic `nearestSwatch` search now live in
// @engine/core/render (alongside EDG32 and Apollo, which are already
// ordinary exported data) and this module just imports them.
//
// MATE_PAL re-exports the SAME 32 role names as the engine's `EDG` (rust,
// clay, cream, …) resolved to Resurrect-64 values, for the same reason
// Citadel's `CITADEL_PAL` and Hollow's `HOLLOW_PAL` modules do: downstream
// MateQuest code can import as
//
//     import { MATE_PAL as EDG } from "<...>/render/mate-palette";
//
// so call sites can refer to `EDG.rust`, `EDG.steel`, … unchanged if code is
// ever shared/copied across the palette-role-using games.

import { RESURRECT64, RESURRECT64_SET, nearestSwatch, type Resurrect64Color } from "@engine/core/render";

export { RESURRECT64, RESURRECT64_SET };
export type { Resurrect64Color };

/**
 * Nearest Resurrect-64 colour by squared RGB distance — a thin alias over the
 * engine's generic `nearestSwatch`.
 */
export function nearestResurrect64(hex: string): Resurrect64Color {
  return nearestSwatch(hex, RESURRECT64);
}

/**
 * The 32 EDG role names mapped to Resurrect-64 values — hand-tuned for hue
 * fidelity (verbatim from the M0 brief; do NOT recompute or reorder), kept
 * in lockstep with the shared role contract by mate-palette.test.ts.
 */
export const MATE_PAL = {
  rust: "#b33831",
  clay: "#cd683d",
  cream: "#fdcbb0",
  tan: "#e6904e",
  wood: "#9e4539",
  woodDark: "#6e2727",
  bark: "#45293f",
  crimson: "#ae2334",
  red: "#e83b3b",
  orange: "#fb6b1d",
  gold: "#f9c22b",
  yellow: "#fbff86",
  green: "#91db69",
  greenMid: "#239063",
  greenDark: "#165a4c",
  teal: "#0b5e65",
  blue: "#4d65b4",
  skyBlue: "#4d9be6",
  cyan: "#30e1b9",
  white: "#ffffff",
  silver: "#c7dcd0",
  steel: "#9babb2",
  slate: "#7f708a",
  navy: "#323353",
  ink: "#3e3546",
  black: "#2e222f",
  hotPink: "#f04f78",
  plum: "#6b3e75",
  mauve: "#a24b6f",
  salmon: "#f68181",
  skin: "#fca790",
  skinMid: "#ab947a",
} satisfies Record<string, Resurrect64Color>;
