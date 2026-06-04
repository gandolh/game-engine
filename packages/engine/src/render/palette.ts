/**
 * EDG32 — the project's single, mandatory color palette.
 *
 * Endesga-32 (EDG32) by Endesga — https://lospec.com/palette-list/endesga-32
 *
 * Every color drawn anywhere in the engine, the game, and the tooling MUST be
 * one of these 32 swatches. This module is the single source of truth:
 *
 *   - `EDG32` — the 32 colors as lowercase "#rrggbb" strings, in palette order.
 *   - `EDG` — the same colors as readable named constants (use these in code).
 *   - `EDG32_SET` — a Set for O(1) membership / validation.
 *   - `isEdg32()` / `nearestEdg32()` — validation + snapping helpers.
 *
 * New assets and UI: pick from `EDG` by name. Do NOT introduce raw hex literals
 * — the palette guard test (palette.test.ts) scans the source tree and fails on
 * any "#rrggbb" that is not an EDG32 color. If you genuinely need a value the
 * palette can't express (an alpha-blended gradient anchor, say), build it from
 * EDG32 RGB tuples via `rgbOf()` rather than a literal, or add the file to the
 * guard's documented allowlist with a comment explaining why.
 */

/** The 32 EDG32 colors, in canonical palette order, lowercase "#rrggbb". */
export const EDG32 = [
  "#be4a2f",
  "#d77643",
  "#ead4aa",
  "#e4a672",
  "#b86f50",
  "#733e39",
  "#3e2731",
  "#a22633",
  "#e43b44",
  "#f77622",
  "#feae34",
  "#fee761",
  "#63c74d",
  "#3e8948",
  "#265c42",
  "#193c3e",
  "#124e89",
  "#0099db",
  "#2ce8f5",
  "#ffffff",
  "#c0cbdc",
  "#8b9bb4",
  "#5a6988",
  "#3a4466",
  "#262b44",
  "#181425",
  "#ff0044",
  "#68386c",
  "#b55088",
  "#f6757a",
  "#e8b796",
  "#c28569",
] as const;

export type Edg32Color = (typeof EDG32)[number];

/**
 * Named EDG32 swatches. Names describe hue/role so call sites read clearly.
 * Indices follow the canonical lospec ordering above.
 */
export const EDG = {
  rust: "#be4a2f", //  0  brick / rust red-orange
  clay: "#d77643", //  1  clay / pumpkin orange
  cream: "#ead4aa", //  2  cream / parchment
  tan: "#e4a672", //  3  tan / wheat
  wood: "#b86f50", //  4  light wood
  woodDark: "#733e39", //  5  dark wood / leather
  bark: "#3e2731", //  6  near-black brown / bark
  crimson: "#a22633", //  7  deep crimson
  red: "#e43b44", //  8  bright red
  orange: "#f77622", //  9  saturated orange
  gold: "#feae34", // 10  gold / amber
  yellow: "#fee761", // 11  bright yellow
  green: "#63c74d", // 12  leaf / grass light
  greenMid: "#3e8948", // 13  grass / forest
  greenDark: "#265c42", // 14  deep green
  teal: "#193c3e", // 15  dark teal
  blue: "#124e89", // 16  deep ocean blue
  skyBlue: "#0099db", // 17  bright sky / water blue
  cyan: "#2ce8f5", // 18  bright cyan
  white: "#ffffff", // 19  pure white
  silver: "#c0cbdc", // 20  light blue-grey
  steel: "#8b9bb4", // 21  steel blue-grey
  slate: "#5a6988", // 22  slate blue-grey
  navy: "#3a4466", // 23  dark slate-navy
  ink: "#262b44", // 24  ink / dark navy
  black: "#181425", // 25  near-black (darkest)
  hotPink: "#ff0044", // 26  hot pink-red
  plum: "#68386c", // 27  plum / purple
  mauve: "#b55088", // 28  mauve / magenta
  salmon: "#f6757a", // 29  salmon / pink
  skin: "#e8b796", // 30  light skin / sand
  skinMid: "#c28569", // 31  mid skin / tan-brown
} as const satisfies Record<string, Edg32Color>;

/** O(1) membership set (lowercase hex). */
export const EDG32_SET: ReadonlySet<string> = new Set(EDG32);

/** Normalize a "#rgb"/"#rrggbb" (any case) to lowercase "#rrggbb". */
export function normalizeHex(hex: string): string {
  let c = hex.trim().toLowerCase();
  if (c.startsWith("#")) c = c.slice(1);
  if (c.length === 3) c = c.split("").map((ch) => ch + ch).join("");
  return `#${c}`;
}

/** True if `hex` is exactly one of the EDG32 colors. */
export function isEdg32(hex: string): boolean {
  return EDG32_SET.has(normalizeHex(hex));
}

/** "#rrggbb" → [r,g,b]. */
export function rgbOf(hex: string): [number, number, number] {
  const c = normalizeHex(hex).slice(1);
  const n = parseInt(c, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Nearest EDG32 color to an arbitrary hex (squared-RGB distance). */
export function nearestEdg32(hex: string): Edg32Color {
  const [r, g, b] = rgbOf(hex);
  let best: Edg32Color = EDG32[0];
  let bestD = Infinity;
  for (const c of EDG32) {
    const [cr, cg, cb] = rgbOf(c);
    const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}
