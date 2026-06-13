import type { FishKind } from "../components";

export const ONT_CORAL = {
  CAUGHT: "coral-caught",
} as const;

export type CoralOntology = (typeof ONT_CORAL)[keyof typeof ONT_CORAL];

export interface CoralCaughtBody {
  farmerId: number;
  farmerName: string;
  fish: FishKind;
  reefId: string;

  value: number;
}
