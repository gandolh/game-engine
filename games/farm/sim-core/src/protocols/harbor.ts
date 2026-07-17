

import type { CropKind, CropQuality } from "../components";

export const ONT_HARBOR = {
  CONTRACT_POSTED:    "harbor/contract-posted",
  CONTRACT_COMMITTED: "harbor/contract-committed",
  CONTRACT_DELIVERED: "harbor/contract-delivered",
  CONTRACT_MISSED:    "harbor/contract-missed",
  CONTRACT_EXPIRED:   "harbor/contract-expired",
} as const;

export type HarborOntology = (typeof ONT_HARBOR)[keyof typeof ONT_HARBOR];

export interface ContractGoods {

  crop: CropKind;

  minQuality: CropQuality;

  quantity: number;
}

/**
 * Contract size band (2026-07-16 brief: tiered harbor contracts). Orthogonal
 * to `tier` (which gates reputation + crop pool): only the always-available
 * "normal" tier is offered across all three sizes — "silver"/"gold" stay
 * single-size ("large"), preserving them as the rare, hoarder-shaped big
 * hauls. "large" is byte-for-byte today's pre-brief economics (same qty
 * range, same `CONTRACT_REWARD_MULT`); "small"/"medium" are new, smaller,
 * proportionally-lower-multiplier bands so a mid-wealth non-hoarder can
 * plausibly commit with normal mid-game holdings.
 */
export type ContractSize = "small" | "medium" | "large";

export interface HarborContract {

  id: string;

  goods: ContractGoods;

  reward: number;

  reputationReward: number;

  postedDay: number;

  deadlineDay: number;

  minReputation: number;

  tier: "normal" | "silver" | "gold";

  size: ContractSize;
}

export interface ContractPostedBody {
  contract: HarborContract;
}

export interface ContractCommittedBody {
  contractId: string;
  farmerId: number;
  farmerName: string;
}

export interface ContractDeliveredBody {
  contractId: string;
  farmerId: number;
  farmerName: string;
  reward: number;
  reputationReward: number;
  deliveryDay: number;
}

export interface ContractMissedBody {
  contractId: string;
  farmerId: number;
  farmerName: string;
  penaltyReputation: number;
}

export interface ContractExpiredBody {
  contractId: string;
  day: number;
}
