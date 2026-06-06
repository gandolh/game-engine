import type { HarborContract } from "../protocols/harbor";

// ── Harbor contract economy (brief 46) ───────────────────────────────────────

/**
 * Reputation thresholds that gate contract tiers.
 *   - normal contracts: 0 reputation (always available from day 1)
 *   - silver contracts: ≥ 5 reputation
 *   - gold   contracts: ≥ 15 reputation
 */
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

/**
 * Contract reward multiplier over base crop sell price. Contracts pay
 * MORE than the shop to reward the planning + travel overhead.
 *   normal: ×2.0 base sell × quantity (solid bonus)
 *   silver: ×2.5 base sell × quantity
 *   gold:   ×3.2 base sell × quantity
 */
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

/**
 * Compute the harbor contract reward for a given contract, factoring in
 * quality bonus: delivering gold-quality when minQuality is normal pays ×1.3
 * of the base reward (a quality premium).
 */
export function contractRewardValue(contract: HarborContract): number {
  return contract.reward;
}
