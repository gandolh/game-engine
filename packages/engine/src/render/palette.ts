

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
