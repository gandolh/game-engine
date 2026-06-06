import type { CropKind, CropQualityCounts } from "./crops";
import type { FishKind } from "./fish";
import type { Tool, WateringCan } from "./tools";
import type { ProductKind } from "./livestock";
import type { FruitKind } from "./orchard";

/**
 * brief 41 — quality representation choice (DESIGN DECISION):
 *
 * We keep `crops: Record<CropKind, number>` as the TOTAL count (backward-
 * compatible with all existing call sites that read crop totals) and add a
 * parallel optional `cropQuality?: Record<CropKind, CropQualityCounts>` for
 * the quality breakdown. This is the least-invasive path: all existing code
 * that reads `inv.crops[crop]` keeps working; quality-aware code (sell price
 * weighting, leaderboard, tooltip) reads `cropQuality[crop]` with a helper
 * that defaults to all-Normal when absent.
 *
 * Helpers: `totalCropCount(inv, crop)` (= inv.crops[crop]), and
 * `cropInventoryValue(inv, crop, basePrice)` accounting for quality tiers.
 * Both are in economy.ts (co-located with the price constants).
 */
export interface Inventory {
  gold: number;
  /** Total harvested crop count per kind. Use with cropQuality for quality split. */
  crops: Record<CropKind, number>;
  seeds: Record<CropKind, number>;
  /**
   * brief 41 — per-quality breakdown of harvested crops. Optional: when absent
   * (or when a crop's entry is absent), all units are treated as Normal quality.
   * `crops[crop]` always equals `normal + silver + gold` when this is present.
   */
  cropQuality?: Partial<Record<CropKind, CropQualityCounts>>;
  /**
   * Golden beans (brief 24) — a rare, high-value status good won only at the
   * shopkeeper's auction. Not a `CropKind` (it can't be planted); a winner can
   * resell it to the shop above the auction reserve, or gift it to a peer on a
   * MEET encounter for a large trust boost. Optional/defaulted so existing
   * inventories (and tests) that omit it read as zero.
   */
  goldenBeans?: number;
  /**
   * Fish caught (not yet sold), by kind. Optional/defaulted so existing
   * inventories and tests that omit it read as zero. Sold to the shopkeeper for
   * `FISH_VALUE` gold each (see ActSystem.handleFish — fishing banks gold
   * directly on the catch, so this is mostly a running tally for the UI).
   */
  fish?: Record<FishKind, number>;
  /** Tools owned by this farmer. One entry per tool owned (can stack same kind+tier). */
  tools?: Tool[];
  /** Watering can state. Optional so pre-tool saves read as full can. */
  wateringCan?: WateringCan;
  /**
   * brief 42 — livestock products held (not yet sold). Each product kind may
   * have quality tiers (reusing CropQualityCounts). Optional so pre-42 saves read as empty.
   * `products[kind]` total == normal + silver + gold in the CropQualityCounts entry.
   */
  products?: Partial<Record<ProductKind, CropQualityCounts>>;
  /**
   * brief 42 — fruit in inventory (from orchard harvest). Quality-tracked like crops.
   * Optional so pre-42 saves read as empty.
   */
  fruit?: Partial<Record<FruitKind, CropQualityCounts>>;
}

export interface ActionPoints {
  current: number;
  max: number;
  penaltyPending: boolean;
  penaltyCapacity: number;
  away: boolean;
  /**
   * brief 27 — set true when the farmer was NOT home at nightfall (caught away
   * during the night phase). Consumed at the next day's AP refill to halve the
   * starting AP (the "sleep in your own bed" rule). Cleared on a rested wake.
   */
  unrested?: boolean;
}

/** Resources a farmer can hold from chopping/mining. */
export interface ResourceInventory {
  wood: number;
  stone: number;
  ironOre: number;
  geodes: number;
}
