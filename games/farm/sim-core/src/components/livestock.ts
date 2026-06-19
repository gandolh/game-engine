import type { RegionId } from "../world/regions";

export type AnimalKind = "chicken" | "cow" | "sheep";

export type ProductKind = "egg" | "milk" | "wool";

export interface Pen {
  kind: "coop" | "barn";
  animal: AnimalKind;
  count: number;

  care: number;

  fedToday: boolean;
  tileX: number;
  tileY: number;
  regionId: RegionId;
  ownerId: number;
}
