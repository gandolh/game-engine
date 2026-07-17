import type { ContractSize, HarborContract } from "../protocols/harbor";

export const HARBOR_REP_THRESHOLD: Record<"normal" | "silver" | "gold", number> = {
  normal: 0,
  silver: 5,
  gold:   15,
};

export const HARBOR_REP_MISS_PENALTY = 3;

export const HARBOR_POST_CADENCE = 3;

export const HARBOR_BATCH_SIZE = 2;

export const CONTRACT_REWARD_MULT: Record<"normal" | "silver" | "gold", number> = {
  normal: 2.0,
  silver: 2.5,
  gold:   3.2,
};

export const CONTRACT_REP_REWARD: Record<"normal" | "silver" | "gold", number> = {
  normal: 2,
  silver: 4,
  gold:   8,
};

export const CONTRACT_DEADLINE_DAYS: Record<"normal" | "silver" | "gold", number> = {
  normal: 6,
  silver: 8,
  gold:   10,
};

// Size bands only apply to the "normal" reputation tier (see ContractSize
// doc comment) — "large" reuses TIER_QTY[tier] / CONTRACT_REWARD_MULT[tier]
// unchanged, so it is deliberately absent from these tables.
type SmallOrMedium = Exclude<ContractSize, "large">;

export const CONTRACT_SIZE_QTY: Record<SmallOrMedium, [number, number]> = {
  small:  [2, 3],
  medium: [3, 5],
};

// Reward multiplier for small/medium — smaller than CONTRACT_REWARD_MULT.normal
// (2.0) but still strictly >1x, so the tier stays worth taking at all sizes.
export const CONTRACT_SIZE_MULT: Record<SmallOrMedium, number> = {
  small:  1.3,
  medium: 1.6,
};

// Reputation payout scale relative to CONTRACT_REP_REWARD[tier] — a smaller
// ask earns proportionally less reputation than a full-size delivery.
export const CONTRACT_SIZE_REP_SCALE: Record<SmallOrMedium, number> = {
  small:  0.5,
  medium: 0.75,
};

export function contractRewardValue(contract: HarborContract): number {
  return contract.reward;
}
