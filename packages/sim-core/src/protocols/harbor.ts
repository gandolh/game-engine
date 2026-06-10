/**
 * Harbor contract ontology — FIPA-ACL-style performatives for the shipping
 * contracts system (brief 46). Mirrors the bounty/festival ontology pattern:
 * world → broadcast announces; farmers commit/deliver via the harbor entity
 * inbox; HarborSystem resolves outcomes.
 *
 * CONTRACT_POSTED:  A new contract is available at the harbor board.
 * CONTRACT_COMMITTED: A farmer has committed to a contract (intent to deliver).
 * CONTRACT_DELIVERED: A farmer delivered goods before the deadline → payout.
 * CONTRACT_MISSED:   Deadline expired on a committed contract → penalty.
 * CONTRACT_EXPIRED:  Deadline expired on an open (uncommitted) contract → removed.
 */

import type { CropKind, CropQuality } from "../components";

export const ONT_HARBOR = {
  CONTRACT_POSTED:    "harbor/contract-posted",
  CONTRACT_COMMITTED: "harbor/contract-committed",
  CONTRACT_DELIVERED: "harbor/contract-delivered",
  CONTRACT_MISSED:    "harbor/contract-missed",
  CONTRACT_EXPIRED:   "harbor/contract-expired",
} as const;

export type HarborOntology = (typeof ONT_HARBOR)[keyof typeof ONT_HARBOR];

// ── Contract definition ───────────────────────────────────────────────────────

/** The goods specification for a contract. */
export interface ContractGoods {
  /** Crop the dock wants. */
  crop: CropKind;
  /** Minimum quality tier that counts (a higher-quality unit still satisfies). */
  minQuality: CropQuality;
  /** Number of units required. */
  quantity: number;
}

/**
 * A single harbor contract. Contracts are value objects (no mutation after
 * creation); HarborSystem tracks commitment state separately.
 */
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

// ── Message bodies ────────────────────────────────────────────────────────────

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
