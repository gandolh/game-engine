import type { HarborContract } from "../protocols/harbor";

/** Reputation thresholds to unlock contract tiers (normal=0, silver=5, gold=15). */
export const HARBOR_REP_THRESHOLD: Record<"normal" | "silver" | "gold", number> = {
  normal: 0,
  silver: 5,
  gold:   15,
};

/** Reputation penalty for missing a committed contract. */
export const HARBOR_REP_MISS_PENALTY = 3;

/** How often (in days) the harbor posts a new batch of contracts. */
export const HARBOR_POST_CADENCE = 3;

/** Number of contracts posted per batch. */
export const HARBOR_BATCH_SIZE = 2;

/** Reward = multiplier × CROP_SELL_PRICE × quantity; contracts pay above shop price to reward planning + travel (normal=×2.0, silver=×2.5, gold=×3.2). */
export const CONTRACT_REWARD_MULT: Record<"normal" | "silver" | "gold", number> = {
  normal: 2.0,
  silver: 2.5,
  gold:   3.2,
};

/** Reputation gained for fulfilling a contract (by tier). */
export const CONTRACT_REP_REWARD: Record<"normal" | "silver" | "gold", number> = {
  normal: 2,
  silver: 4,
  gold:   8,
};

/** Deadline length in days from posting (by tier). Longer deadline = more planning. */
export const CONTRACT_DEADLINE_DAYS: Record<"normal" | "silver" | "gold", number> = {
  normal: 6,
  silver: 8,
  gold:   10,
};

/** Returns the contract reward (gold). Quality bonus is embedded in contract.reward at creation time. */
export function contractRewardValue(contract: HarborContract): number {
  return contract.reward;
}
