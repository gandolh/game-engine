import type { RegionId } from "../world/regions";

/** Fruit tree variants for orchards. apple = autumn yield, cherry = spring yield. */
export type FruitKind = "apple" | "cherry";

export interface OrchardTree {
  kind: FruitKind;
  tileX: number;
  tileY: number;
  regionId: RegionId;
  ownerId: number;
  daysGrown: number;
  /** True once daysGrown >= ORCHARD_MATURATION_DAYS. */
  mature: boolean;
  /** Gates once-per-season yield. */
  lastHarvestDay: number;
  /** Produced on season-start once mature; consumed on harvest. */
  fruitReady: number;
}
