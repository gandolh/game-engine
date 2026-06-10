// Panel and HUD data types — wealth graph, rivalry list, final standings,
// leaderboard rows, and player hotbar state. All structured-clone-friendly.

import type { RunHistoryRow } from "../systems/run-history";
import type { LeaderboardRow } from "./ui-types";

/** Per-farmer wealth time series for the wealth graph. Structured-clone-friendly. */
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

/** LeaderboardRow + crop snapshot for the game-over panel. */
export interface FinalStandingRow extends LeaderboardRow {
  crops: Partial<Record<import("../components").CropKind, number>>;
}

/** `text` = readout (e.g. "10/10", "x3", or "" for durable); `available` dims when unusable. */
export interface HotbarSlotState {
  label: string;
  glyph: string;
  text: string;
  available: boolean;
}

/** Pip's hotbar display state. null when no player entity exists. */
export interface PlayerHotbar {
  slots: HotbarSlotState[];
  selected: number;
}
