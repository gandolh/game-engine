import type { HarborContract } from "../protocols/harbor";

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

export function contractRewardValue(contract: HarborContract): number {
  return contract.reward;
}
