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

// `frame` is the atlas sprite drawn in the hotbar + used to build the per-tool mouse cursor;
// `glyph` stays as a text fallback for environments where the sprite can't be rasterized.
/** `tool` slots act on the tile in front; `seed` slots plant on an empty owned plot. */
export type HotbarSlot =
  | { kind: "tool"; tool: "can" | "hoe" | "axe" | "pickaxe" | "fishing-rod"; label: string; glyph: string; frame: string }
  | { kind: "seed"; crop: CropKind; label: string; glyph: string; frame: string };

/** Hotbar: 1 Can · 2 Hoe · 3 Axe · 4 Pickaxe · 5 Rod · 6 Radish · 7 Wheat · 8 Pumpkin. Source of truth for sim + UI. */
export const HOTBAR_SLOTS: readonly HotbarSlot[] = [
  { kind: "tool", tool: "can",         label: "Can",     glyph: "🪣", frame: "tool/can" },
  { kind: "tool", tool: "hoe",         label: "Hoe",     glyph: "⛏", frame: "tool/hoe" },
  { kind: "tool", tool: "axe",         label: "Axe",     glyph: "🪓", frame: "tool/axe" },
  { kind: "tool", tool: "pickaxe",     label: "Pickaxe", glyph: "⚒", frame: "tool/pickaxe" },
  { kind: "tool", tool: "fishing-rod", label: "Rod",     glyph: "🎣", frame: "tool/fishing-rod" },
  { kind: "seed", crop: "radish",      label: "Radish",  glyph: "🌱", frame: "crop/radish/seed" },
  { kind: "seed", crop: "wheat",       label: "Wheat",   glyph: "🌾", frame: "crop/wheat/seed" },
  { kind: "seed", crop: "pumpkin",     label: "Pumpkin", glyph: "🎃", frame: "crop/pumpkin/seed" },
];
