/**
 * The swatch table for MateQuest's combat creatures (corpus brief 12). A recipe character names a `MATE_PAL`
 * role; `MATE_ROLES` holds the roles the creatures use, with `MATE_PAL`'s values (Resurrect-64 colours).
 * The client's `sprites.test.ts` pins every value to its `MATE_PAL` role, and the cook checks them against
 * Resurrect-64, so neither can drift.
 */
export const MATE_ROLES = {
  bark: "#45293f",
  black: "#2e222f",
  blue: "#4d65b4",
  clay: "#cd683d",
  cream: "#fdcbb0",
  cyan: "#30e1b9",
  gold: "#f9c22b",
  green: "#91db69",
  greenDark: "#165a4c",
  greenMid: "#239063",
  ink: "#3e3546",
  mauve: "#a24b6f",
  navy: "#323353",
  orange: "#fb6b1d",
  plum: "#6b3e75",
  red: "#e83b3b",
  rust: "#b33831",
  silver: "#c7dcd0",
  skin: "#fca790",
  slate: "#7f708a",
  steel: "#9babb2",
  tan: "#e6904e",
  teal: "#0b5e65",
  white: "#ffffff",
  wood: "#9e4539",
  woodDark: "#6e2727",
  yellow: "#fbff86",
} as const;

export type MateRole = keyof typeof MATE_ROLES;

/** Recipe character → the role it paints. `.` is transparent. */
export const CHAR_ROLE: Readonly<Record<string, MateRole>> = {
  B: "bark",
  k: "black",
  b: "blue",
  c: "clay",
  e: "cream",
  a: "cyan",
  y: "gold",
  g: "green",
  G: "greenDark",
  m: "greenMid",
  K: "ink",
  M: "mauve",
  n: "navy",
  o: "orange",
  p: "plum",
  R: "red",
  r: "rust",
  v: "silver",
  s: "skin",
  l: "slate",
  L: "steel",
  T: "tan",
  t: "teal",
  "#": "white",
  w: "wood",
  W: "woodDark",
  Y: "yellow",
};

function rgba(hex: string): [number, number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255];
}

/** Character → RGBA, for the cook. */
export const SWATCH: Record<string, [number, number, number, number]> = { ".": [0, 0, 0, 0] };
for (const [ch, role] of Object.entries(CHAR_ROLE)) SWATCH[ch] = rgba(MATE_ROLES[role]);
