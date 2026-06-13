import type { CropKind } from "../../components";

export const DIR_DELTA: Record<string, { dx: number; dy: number }> = {
  up:    { dx: 0,  dy: -1 },
  down:  { dx: 0,  dy: 1 },
  left:  { dx: -1, dy: 0 },
  right: { dx: 1,  dy: 0 },
};

export const PLAYER_STEP_TICKS = 3;

export type HotbarSlot =
  | { kind: "tool"; tool: "can" | "hoe" | "axe" | "pickaxe" | "fishing-rod"; label: string; glyph: string; frame: string }
  | { kind: "seed"; crop: CropKind; label: string; glyph: string; frame: string };

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
