

import type { RunHistoryRow } from "../systems/messaging/run-history";
import type { LeaderboardRow } from "./ui-types";
import type { ItemRef } from "../components/items";

export interface SnapshotWealthSeries {
  farmerId: number;
  name: string;
  personality: string;

  rows: RunHistoryRow[];
}

export interface SnapshotRivalry {
  aId: number;
  bId: number;
  aName: string;
  bName: string;
  score: number;
  kind: "rivalry" | "alliance";
}

export interface FinalStandingRow extends LeaderboardRow {
  crops: Partial<Record<import("../components").CropKind, number>>;
}

export interface HotbarSlotState {
  label: string;
  glyph: string;
  frame: string;
  text: string;
  available: boolean;
}

export interface PlayerHotbar {
  slots: HotbarSlotState[];
  selected: number;
}

export interface ItemSlotState {
  ref: ItemRef | null;
  label: string;
  glyph: string;
  frame: string;
  text: string;
  available: boolean;

  actionable: boolean;
}

export interface PlayerInventory {
  slots: ItemSlotState[];
  hotbarSize: number;
  selected: number;
  gold: number;
}
