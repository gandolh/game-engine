import type { FishKind } from "../components";

// Broadcast on a lobster catch only (routine coral-trout would flood the feed).
export const ONT_CORAL = {
  CAUGHT: "coral-caught",
} as const;

export type CoralOntology = (typeof ONT_CORAL)[keyof typeof ONT_CORAL];

export interface CoralCaughtBody {
  farmerId: number;
  farmerName: string;
  fish: FishKind;
  reefId: string;
  /** Gold value of the catch (for the feed line). */
  value: number;
}
