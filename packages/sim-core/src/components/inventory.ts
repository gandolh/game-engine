import type { CropKind, CropQualityCounts } from "./crops";
import type { FishKind } from "./fish";
import type { Tool, WateringCan } from "./tools";
import type { ProductKind } from "./livestock";
import type { FruitKind } from "./orchard";

export interface Inventory {
  gold: number;
  /** Total count per kind. `crops[crop]` === sum of cropQuality tiers when quality is tracked. */
  crops: Record<CropKind, number>;
  seeds: Record<CropKind, number>;
  /** Per-quality breakdown. Absent = all Normal. */
  cropQuality?: Partial<Record<CropKind, CropQualityCounts>>;
  /** Rare auction-only status good; can't be planted. Optional → 0. */
  goldenBeans?: number;
  /** Fish caught (running tally for UI). Optional → 0. */
  fish?: Record<FishKind, number>;
  tools?: Tool[];
  /** Watering can state. Optional → full can. */
  wateringCan?: WateringCan;
  /** Livestock products held (quality-tracked). Optional → empty. */
  products?: Partial<Record<ProductKind, CropQualityCounts>>;
  /** Orchard fruit held (quality-tracked). Optional → empty. */
  fruit?: Partial<Record<FruitKind, CropQualityCounts>>;
}

export interface ActionPoints {
  current: number;
  max: number;
  penaltyPending: boolean;
  penaltyCapacity: number;
  away: boolean;
  /** Set when caught away at nightfall; halves next-day AP. Cleared on rested wake. */
  unrested?: boolean;
}

/** Resources a farmer can hold from chopping/mining. */
export interface ResourceInventory {
  wood: number;
  stone: number;
  ironOre: number;
  geodes: number;
}
