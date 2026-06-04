// Daily notice-board bounty: the village posts a demand for one crop each day at
// a price premium. Agents that perceive a bounty for a crop they hold/grow can
// prioritize selling it, which differentiates personalities (opportunists chase
// the premium; conservatives ignore it).

import type { CropKind } from "../components";

export const ONT_BOUNTY = {
  /** world → broadcast: today's bounty (or none). */
  POSTED: "bounty-posted",
} as const;

export type BountyOntology = (typeof ONT_BOUNTY)[keyof typeof ONT_BOUNTY];

export interface Bounty {
  /** The crop the village wants today. */
  crop: CropKind;
  /** Sell-price multiplier applied at the shopkeeper for this crop today. */
  multiplier: number;
  /** Target quantity the village is buying (display/flavor; not hard-capped). */
  quantity: number;
  /** Sim day the bounty is active. */
  day: number;
}

export interface BountyPostedBody {
  /** The active bounty, or null on a day with no bounty. */
  bounty: Bounty | null;
}
