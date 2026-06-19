

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

export interface HarborContract {

  id: string;

  goods: ContractGoods;

  reward: number;

  reputationReward: number;

  postedDay: number;

  deadlineDay: number;

  minReputation: number;

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
