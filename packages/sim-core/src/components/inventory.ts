import type { CropKind, CropQualityCounts } from "./crops";
import type { FishKind } from "./fish";
import type { Tool, WateringCan } from "./tools";
import type { ProductKind } from "./livestock";
import type { FruitKind } from "./orchard";

export interface Inventory {
  gold: number;

  crops: Record<CropKind, number>;
  seeds: Record<CropKind, number>;

  cropQuality?: Partial<Record<CropKind, CropQualityCounts>>;

  goldenBeans?: number;

  fish?: Record<FishKind, number>;
  tools?: Tool[];

  wateringCan?: WateringCan;

  products?: Partial<Record<ProductKind, CropQualityCounts>>;

  fruit?: Partial<Record<FruitKind, CropQualityCounts>>;
}

export interface ActionPoints {
  current: number;
  max: number;
  penaltyPending: boolean;
  penaltyCapacity: number;
  away: boolean;

  unrested?: boolean;
}

export interface ResourceInventory {
  wood: number;
  stone: number;
  ironOre: number;
  geodes: number;
}
