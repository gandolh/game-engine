

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

export const EDG = {
  rust: "#be4a2f", 
  clay: "#d77643", 
  cream: "#ead4aa", 
  tan: "#e4a672", 
  wood: "#b86f50", 
  woodDark: "#733e39", 
  bark: "#3e2731", 
  crimson: "#a22633", 
  red: "#e43b44", 
  orange: "#f77622", 
  gold: "#feae34", 
  yellow: "#fee761", 
  green: "#63c74d", 
  greenMid: "#3e8948", 
  greenDark: "#265c42", 
  teal: "#193c3e", 
  blue: "#124e89", 
  skyBlue: "#0099db", 
  cyan: "#2ce8f5", 
  white: "#ffffff", 
  silver: "#c0cbdc", 
  steel: "#8b9bb4", 
  slate: "#5a6988", 
  navy: "#3a4466", 
  ink: "#262b44", 
  black: "#181425", 
  hotPink: "#ff0044", 
  plum: "#68386c", 
  mauve: "#b55088", 
  salmon: "#f6757a", 
  skin: "#e8b796", 
  skinMid: "#c28569", 
} as const satisfies Record<string, Edg32Color>;

export const EDG32_SET: ReadonlySet<string> = new Set(EDG32);

export function normalizeHex(hex: string): string {
  let c = hex.trim().toLowerCase();
  if (c.startsWith("#")) c = c.slice(1);
  if (c.length === 3) c = c.split("").map((ch) => ch + ch).join("");
  return `#${c}`;
}

export function isEdg32(hex: string): boolean {
  return EDG32_SET.has(normalizeHex(hex));
}

export function rgbOf(hex: string): [number, number, number] {
  const c = normalizeHex(hex).slice(1);
  const n = parseInt(c, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

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

// --- Apollo-46 (by AdamCYounis) — shared by Citadel and Hollow ---
//
// sweep-02: this list and `nearestSwatch` below used to be hand-maintained in
// five places (Citadel's palette module + its test, Hollow's palette module +
// its test, and this file's own test as the off-palette scan's membership
// set) with nothing asserting the copies agreed. A palette is data, not a
// game, so — exactly like `EDG32` above — it can live here as an ordinary
// export without breaking "the engine never imports a game": Citadel and
// Hollow now import this one list instead of hand-copying it, and this
// module's own test (palette.test.ts) imports it too instead of restating it.
// Each game's role map (`CITADEL_PAL`, `HOLLOW_PAL`) stays in its own module —
// only the swatch list and the nearest-swatch search were duplicated.
export const APOLLO = [
  // blues
  "#172038", "#253a5e", "#3c5e8b", "#4f8fba", "#73bed3", "#a4dddb",
  // greens
  "#19332d", "#25562e", "#468232", "#75a743", "#a8ca58", "#d0da91",
  // browns / timber
  "#4d2b32", "#7a4841", "#ad7757", "#c09473", "#d7b594", "#e7d5b3",
  // ochre / gold
  "#341c27", "#602c2c", "#884b2b", "#be772b", "#de9e41", "#e8c170",
  // red / orange
  "#241527", "#411d31", "#752438", "#a53030", "#cf573c", "#da863e",
  // purple / pink
  "#1e1d39", "#402751", "#7a367b", "#a23e8c", "#c65197", "#df84a5",
  // neutrals (dark→light)
  "#090a14", "#10141f", "#151d28", "#202e37", "#394a50", "#577277",
  "#819796", "#a8b5b2", "#c7cfcc", "#ebede9",
] as const;

export type ApolloColor = (typeof APOLLO)[number];

export const APOLLO_SET: ReadonlySet<string> = new Set(APOLLO);

// --- Resurrect-64 (by Kerrie Lake) — MateQuest's own palette ---
//
// sweep-02: same duplication shape as Apollo, moved for the same reason
// (nearly free once APOLLO + nearestSwatch existed). MateQuest's role map
// (`MATE_PAL`) stays in `games/mathquest/client/src/render/mate-palette.ts`.
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
 * Nearest colour in an arbitrary swatch list by squared RGB distance.
 * Generic over the swatch list so Apollo (Citadel/Hollow), Resurrect-64
 * (MateQuest) and any future palette all share one search instead of each
 * hand-copying the same loop (sweep-02). `nearestEdg32` above predates this
 * and is left as its own small function rather than risk changing its output
 * shape.
 */
export function nearestSwatch<T extends string>(hex: string, swatches: readonly T[]): T {
  const [r, g, b] = rgbOf(hex);
  let best: T | undefined;
  let bestD = Infinity;
  for (const c of swatches) {
    const [cr, cg, cb] = rgbOf(c);
    const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  if (best === undefined) {
    throw new Error("nearestSwatch: empty swatch list");
  }
  return best;
}
