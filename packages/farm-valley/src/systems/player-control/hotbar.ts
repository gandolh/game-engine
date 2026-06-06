/**
 * Hotbar constants and types for PlayerControlSystem.
 * Split from player-control.ts.
 */

import type { CropKind } from "../../components";

/** Direction → unit tile delta. */
export const DIR_DELTA: Record<string, { dx: number; dy: number }> = {
  up:    { dx: 0,  dy: -1 },
  down:  { dx: 0,  dy: 1 },
  left:  { dx: -1, dy: 0 },
  right: { dx: 1,  dy: 0 },
};

/**
 * Ticks between Pip's one-tile commits while a move key is held. At 20 Hz this
 * is ~6.7 tiles/sec — close to the old ~8 tiles/sec feel, but the cadence now
 * lives in the sim (tick-aligned) so we can glide farmer.renderPos across the
 * gap. Mirrors TravelSystem.STEP_TICKS, just faster for a responsive player.
 */
export const PLAYER_STEP_TICKS = 3;

/**
 * What a hotbar slot does. `tool` slots act on the tile in front of Pip with a
 * specific tool/can; `seed` slots plant that crop on an empty owned plot.
 */
export type HotbarSlot =
  | { kind: "tool"; tool: "can" | "hoe" | "axe" | "pickaxe" | "fishing-rod"; label: string; glyph: string }
  | { kind: "seed"; crop: CropKind; label: string; glyph: string };

/**
 * The player's hotbar, by slot index. The action key uses the SELECTED slot
 * (player.selectedSlot) rather than auto-picking by context. Number keys 1-7
 * select slots 0-6. This list is the single source of truth shared by the sim
 * (action dispatch), the snapshot, and the hotbar UI.
 *
 *   1 Can · 2 Hoe · 3 Axe · 4 Pickaxe · 5 Rod · 6 Radish · 7 Wheat · 8 Pumpkin
 */
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
