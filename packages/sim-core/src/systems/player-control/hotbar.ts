import type { CropKind } from "../../components";

/** Direction → unit tile delta. */
export const DIR_DELTA: Record<string, { dx: number; dy: number }> = {
  up:    { dx: 0,  dy: -1 },
  down:  { dx: 0,  dy: 1 },
  left:  { dx: -1, dy: 0 },
  right: { dx: 1,  dy: 0 },
};

/** Ticks per tile commit while move key held; ~6.7 tiles/sec at 20 Hz. Sim-aligned for renderPos glide. */
export const PLAYER_STEP_TICKS = 3;

/** `tool` slots act on the tile in front; `seed` slots plant on an empty owned plot. */
export type HotbarSlot =
  | { kind: "tool"; tool: "can" | "hoe" | "axe" | "pickaxe" | "fishing-rod"; label: string; glyph: string }
  | { kind: "seed"; crop: CropKind; label: string; glyph: string };

/** Hotbar: 1 Can · 2 Hoe · 3 Axe · 4 Pickaxe · 5 Rod · 6 Radish · 7 Wheat · 8 Pumpkin. Source of truth for sim + UI. */
export const HOTBAR_SLOTS: readonly HotbarSlot[] = [
  { kind: "tool", tool: "can",         label: "Can",     glyph: "🪣" },
  { kind: "tool", tool: "hoe",         label: "Hoe",     glyph: "⛏" },
  { kind: "tool", tool: "axe",         label: "Axe",     glyph: "🪓" },
  { kind: "tool", tool: "pickaxe",     label: "Pickaxe", glyph: "⚒" },
  { kind: "tool", tool: "fishing-rod", label: "Rod",     glyph: "🎣" },
  { kind: "seed", crop: "radish",      label: "Radish",  glyph: "🌱" },
  { kind: "seed", crop: "wheat",       label: "Wheat",   glyph: "🌾" },
  { kind: "seed", crop: "pumpkin",     label: "Pumpkin", glyph: "🎃" },
];
