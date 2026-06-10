// Panel and HUD data types — wealth graph, rivalry list, final standings,
// leaderboard rows, and player hotbar state. All structured-clone-friendly.

import type { RunHistoryRow } from "../systems/run-history";
import type { LeaderboardRow } from "./ui-types";

/**
 * Per-farmer wealth time series for the wealth-over-time graph (brief 39).
 * One entry per farmer, carrying all historical gold-per-day rows plus the
 * farmer's display name and personality so the chart can label/color lines
 * without a second cross-reference lookup on the main thread.
 *
 * Structured-clone-friendly: plain object arrays, no Maps/Sets.
 */
export interface SnapshotWealthSeries {
  farmerId: number;
  name: string;
  personality: string;
  /** Rows in ascending day order. Each row is one RunHistoryRow entry. */
  rows: RunHistoryRow[];
}

/** One active rivalry/alliance entry, structured-clone-friendly. */
export interface SnapshotRivalry {
  aId: number;
  bId: number;
  aName: string;
  bName: string;
  score: number;
  kind: "rivalry" | "alliance";
}

/**
 * Final-standings row: LeaderboardRow plus the crop inventory snapshot. Used
 * only in `RenderSnapshot.finalSummary` so the game-over panel can print crop
 * counts without needing a second data source.
 */
/** brief 41 — crops is now a flexible partial map (all 8 kinds may appear). */
export interface FinalStandingRow extends LeaderboardRow {
  crops: Partial<Record<import("../components").CropKind, number>>;
}

/**
 * One hotbar slot's live display state. `text` is the count/charge readout
 * (e.g. "10/10", "x3", or "" for a durable tool); `available` dims the slot
 * when the player can't currently use it (e.g. a seed with zero in stock).
 */
export interface HotbarSlotState {
  label: string;
  glyph: string;
  text: string;
  available: boolean;
}

/**
 * Player (Pip) hotbar state for the bottom-center tool bar. Slots and their
 * order are defined by HOTBAR_SLOTS in systems/player-control.ts (1 Can,
 * 2 Hoe, 3 Axe, 4 Pickaxe, 5 Radish, 6 Wheat, 7 Pumpkin). `selected` is the
 * active slot index the action key uses. null when there is no player entity.
 */
export interface PlayerHotbar {
  slots: HotbarSlotState[];
  selected: number;
}
