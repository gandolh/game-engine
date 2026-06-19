

import type { CropKind } from "../components";

export const ONT_BOUNTY = {

  POSTED: "bounty-posted",
} as const;

export type BountyOntology = (typeof ONT_BOUNTY)[keyof typeof ONT_BOUNTY];

export interface Bounty {

  crop: CropKind;

  multiplier: number;

  quantity: number;

  day: number;
}

export interface BountyPostedBody {

  bounty: Bounty | null;
}
