import type { RegionId } from "../world/regions";
import type { ItemRef } from "./items";

export type FarmerFsmState =
  | "WAIT_DAY"
  | "PERCEIVE"
  | "DELIBERATE"
  | "ACT"
  | "FINISH_DAY"
  | "SLEEP";

export interface Farmer {
  name: string;
  currentRegion: RegionId;
  homeRegion?: RegionId;
  /** ActSystem skips execution while busy; animation plays before the next action fires. */
  busyUntilTick?: number;
  path?: {
    waypoints: ReadonlyArray<{ x: number; y: number }>;
    nextIndex: number;       // index of the next waypoint to step onto
    ticksUntilStep: number;  // countdown to next tile step
  } | undefined;
  /** Render-only sub-tile position (tile units). Never read by sim logic; authoritative position is `transform`. */
  renderPos?: { x: number; y: number } | undefined;
  /** True the tick Pip moved via direct input (WASD). Cleared each tick. Used for walk-cycle animation. */
  movedThisTick?: boolean;
  /** Day the farmer last hired a tavern helper (gates once-per-day re-hire). */
  helperHiredDay?: number;
  /** Day the farmer last prayed at the shrine (gates re-praying by SHRINE_COOLDOWN_DAYS). */
  shrinePrayedDay?: number;
  festivalWins?: number;
  harborReputation?: number;
  committedContract?: import('../protocols/harbor').HarborContract | undefined;
  /** True while aboard a boat (TravelSystem uses the BOAT grid). Cleared on return-to-shore. */
  aboard?: boolean;
}

/** Tags Pip (player-controlled farmer). DeliberateSystem skips it; PlayerControlSystem drives it. */
export interface Player {
  readonly isPlayer: true;
  facing: "up" | "down" | "left" | "right";
  /** Held move axes; null on release. Two axes allow diagonal movement (axis-independent). */
  pendingMoveX: "left" | "right" | null;
  pendingMoveY: "up" | "down" | null;
  pendingAction: boolean;
  selectedSlot: number;
  /**
   * When set by a click-to-act event, the action fires on this tile instead of the faced tile.
   * PlayerControlSystem applies a Chebyshev-≤1 reach guard and clears this field each tick.
   * Defaults null — AI farmers and headless runs are completely inert.
   */
  pendingActionTile: { x: number; y: number } | null;
  /**
   * Unified item-grid layout: the first HOTBAR_SIZE entries are the bottom hotbar row,
   * the rest are the backpack revealed by the inventory panel (E). Each entry references
   * an item identity (`ItemRef`) or null (empty slot); the displayed count comes from the
   * aggregate inventory. This is a player-owned COSMETIC layout — drag-drop swaps two
   * entries but never changes quantities, so the sim economy and determinism are untouched
   * (AI farmers carry no `player` tag, so no `itemSlots`). Lazily initialized by
   * PlayerControlSystem from `defaultItemSlots()` when absent. */
  itemSlots?: (ItemRef | null)[];
}
