// MateQuest's palette: Resurrect-64 (by Kerrie Lake / Dawnbringer lineage's
// 64-colour successor), copied into a MateQuest-owned module — games can't
// import each other (locked convention, root CLAUDE.md), so this is a
// dedicated palette, distinct from the engine's EDG32 (Farm + engine) and
// Citadel/Hollow's Apollo-46.
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

import { rgbOf } from "@engine/core/render";

/**
 * The 64 Resurrect-64 colours (lowercase, 6-digit), in the canonical order
 * from the M0 brief (corpus/todos/2026-07-21-mathquest-M0-scaffold.md).
 * IDENTICAL to the inline scan list in engine/core/src/render/palette.test.ts
 * — the two must be kept in lockstep (this module's own colocated test,
 * mate-palette.test.ts, pins this array to the same literal list).
 */
export const RESURRECT64 = [
  "#2e222f", "#3e3546", "#625565", "#966c6c", "#ab947a", "#694f62", "#7f708a", "#9babb2", "#c7dcd0", "#ffffff",
  "#6e2727", "#b33831", "#ea4f36", "#f57d4a", "#ae2334", "#e83b3b", "#fb6b1d", "#f79617", "#f9c22b", "#7a3045",
  "#9e4539", "#cd683d", "#e6904e", "#fbb954", "#4c3e24", "#676633", "#a2a947", "#d5e04b", "#fbff86", "#165a4c",
  "#239063", "#1ebc73", "#91db69", "#cddf6c", "#313638", "#374e4a", "#547e64", "#92a984", "#b2ba90", "#0b5e65",
  "#0b8a8f", "#0eaf9b", "#30e1b9", "#8ff8e2", "#323353", "#484a77", "#4d65b4", "#4d9be6", "#8fd3ff", "#45293f",
  "#6b3e75", "#905ea9", "#a884f3", "#eaaded", "#753c54", "#a24b6f", "#cf657f", "#ed8099", "#831c5d", "#c32454",
  "#f04f78", "#f68181", "#fca790", "#fdcbb0",
] as const;

export type Resurrect64Color = (typeof RESURRECT64)[number];

export const RESURRECT64_SET: ReadonlySet<string> = new Set(RESURRECT64);

/**
 * Nearest Resurrect-64 colour by squared RGB distance (same shape as the
 * engine's `nearestEdg32` / Citadel's `nearestApollo` / Hollow's
 * `nearestApollo`; reuses `rgbOf` so hex parsing lives in one place).
 */
export function nearestResurrect64(hex: string): Resurrect64Color {
  const [r, g, b] = rgbOf(hex);
  let best: Resurrect64Color = RESURRECT64[0];
  let bestD = Infinity;
  for (const c of RESURRECT64) {
    const [cr, cg, cb] = rgbOf(c);
    const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
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
