import type { RegionId } from "../world/regions";

export const ONT_TRAVEL = {
  ARRIVED: "travel-arrived",
} as const;

export type TravelOntology = (typeof ONT_TRAVEL)[keyof typeof ONT_TRAVEL];

export interface TravelArrivedBody {
  farmerId: number;
  regionId: RegionId;
}
