// Harbor shipping contracts: POSTED (board), COMMITTED (intent), DELIVERED (payout), MISSED (penalty), EXPIRED (unclaimed).

import type { CropKind, CropQuality } from "../components";

export const ONT_HARBOR = {
  CONTRACT_POSTED:    "harbor/contract-posted",
  CONTRACT_COMMITTED: "harbor/contract-committed",
  CONTRACT_DELIVERED: "harbor/contract-delivered",
  CONTRACT_MISSED:    "harbor/contract-missed",
  CONTRACT_EXPIRED:   "harbor/contract-expired",
} as const;

export type HarborOntology = (typeof ONT_HARBOR)[keyof typeof ONT_HARBOR];

/** The goods specification for a contract. */
export interface ContractGoods {
  /** Crop the dock wants. */
  crop: CropKind;
  /** Minimum quality tier that counts (a higher-quality unit still satisfies). */
  minQuality: CropQuality;
  /** Number of units required. */
  quantity: number;
}

/** Immutable value object; HarborSystem tracks commitment state separately. */
export interface HarborContract {
  /** Stable unique id (e.g. "contract-42-3" for day 42 slot 3). */
  id: string;
  /** Goods specification. */
  goods: ContractGoods;
  /** Gold reward when fulfilled before the deadline. */
  reward: number;
  /** Bonus reputation points for fulfilling. */
  reputationReward: number;
  /** Sim day the contract was posted. */
  postedDay: number;
  /** The last sim day on which delivery is accepted (inclusive). */
  deadlineDay: number;
  /** Minimum reputation needed to accept this contract. */
  minReputation: number;
  /** 'normal' | 'silver' | 'gold' difficulty tier (scales reward/deadline). */
  tier: "normal" | "silver" | "gold";
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
