import type { RegionId } from "../world/regions";

/** Animals that can live in a pen. Coops hold chickens; barns hold cows or sheep. */
export type AnimalKind = "chicken" | "cow" | "sheep";

export type ProductKind = "egg" | "milk" | "wool";

/** Pen: coop → eggs, barn → milk/wool. `care` (0–1) affects quality; decays daily. */
export interface Pen {
  kind: "coop" | "barn";
  animal: AnimalKind;
  count: number;
  /** Care scalar, 0–1. 1 = well-tended, 0 = neglected. */
  care: number;
  /** True if the farmer has fed/tended this pen today. */
  fedToday: boolean;
  tileX: number;
  tileY: number;
  regionId: RegionId;
  ownerId: number;
}
