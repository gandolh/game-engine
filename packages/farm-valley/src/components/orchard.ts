import type { RegionId } from "../world/regions";

// ── Orchards (brief 42) ──────────────────────────────────────────────────────

/** Fruit tree variants for orchards. apple = autumn yield, cherry = spring yield. */
export type FruitKind = "apple" | "cherry";

/** A planted orchard tile — tracks maturation and perennial seasonal yields. */
export interface OrchardTree {
  kind: FruitKind;
  tileX: number;
  tileY: number;
  regionId: RegionId;
  ownerId: number;
  /** Days of maturation accrued (counts fractionally like daysGrowing). */
  daysGrown: number;
  /** True once the tree is mature (daysGrown >= ORCHARD_MATURATION_DAYS). */
  mature: boolean;
  /** The game-day of the last fruit harvest (to gate once-per-season yield). */
  lastHarvestDay: number;
  /** Accumulated fruit units ready to pick (produced on season-start once mature). */
  fruitReady: number;
}
