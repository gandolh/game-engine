/**
 * Harbor contract helpers, constants, and types.
 * Split from harbor.ts for brief 46.
 */

import type { Rng } from "@engine/core";
import type { GameEntity } from "../../components";
import {
  CONTRACT_REWARD_MULT,
  CONTRACT_REP_REWARD,
  CONTRACT_DEADLINE_DAYS,
  HARBOR_REP_THRESHOLD,
} from "../../economy";
import { CROP_SELL_PRICE } from "../../economy";
import type { CropKind, CropQuality } from "../../components";
import type { HarborContract } from "../../protocols/harbor";

// ── Eligible crops for contracts: the main 8 crops ───────────────────────────
// Sorted by sell price so higher-value crops appear more often in gold contracts.
export const CONTRACT_CROPS: readonly CropKind[] = [
  "radish", "wheat", "carrot", "tomato", "corn",
  "pumpkin", "grape", "winter-squash",
];

export const CONTRACT_CROPS_HIGH: readonly CropKind[] = [
  "tomato", "corn", "pumpkin", "grape", "winter-squash",
];

// ── Quality distribution by tier ─────────────────────────────────────────────
export const TIER_MIN_QUALITY: Record<"normal" | "silver" | "gold", CropQuality> = {
  normal: "normal",
  silver: "normal",  // silver contracts: any quality acceptable
  gold:   "silver",  // gold contracts: need at least silver
};

// ── Quantity ranges by tier ──────────────────────────────────────────────────
export const TIER_QTY: Record<"normal" | "silver" | "gold", [number, number]> = {
  normal: [4,  8],
  silver: [6,  12],
  gold:   [8,  16],
};

/**
 * Pure, deterministic contract generation. Given a day and a forked Rng,
 * produce `count` contracts for a batch posted on `day`. Exported for unit
 * testing.
 */
export function generateContracts(
  day: number,
  count: number,
  rng: Rng,
  farmerReputations: number[],
): HarborContract[] {
  const contracts: HarborContract[] = [];
  // Determine which tiers are achievable by at least some farmer.
  const maxRep = farmerReputations.length > 0
    ? Math.max(...farmerReputations)
    : 0;

  const availableTiers: Array<"normal" | "silver" | "gold"> = ["normal"];
  if (maxRep >= HARBOR_REP_THRESHOLD.silver) availableTiers.push("silver");
  if (maxRep >= HARBOR_REP_THRESHOLD.gold)   availableTiers.push("gold");

  for (let slot = 0; slot < count; slot++) {
    const tier = rng.pick(availableTiers);
    const crops = tier === "gold" ? CONTRACT_CROPS_HIGH : CONTRACT_CROPS;
    const crop = rng.pick(crops);
    const [minQty, maxQty] = TIER_QTY[tier];
    const quantity = rng.int(minQty, maxQty + 1);
    const baseSell = CROP_SELL_PRICE[crop];
    const reward = Math.round(baseSell * CONTRACT_REWARD_MULT[tier] * quantity);
    const reputationReward = CONTRACT_REP_REWARD[tier];
    const deadlineDay = day + CONTRACT_DEADLINE_DAYS[tier];
    const minReputation = HARBOR_REP_THRESHOLD[tier];
    const minQuality = TIER_MIN_QUALITY[tier];

    contracts.push({
      id: `contract-${day}-${slot}`,
      goods: { crop, minQuality, quantity },
      reward,
      reputationReward,
      postedDay: day,
      deadlineDay,
      minReputation,
      tier,
    });
  }
  return contracts;
}

/**
 * Pure, deterministic contract resolution rank. Checks if a farmer has the
 * goods to fulfill a contract. Returns true if the farmer's inventory has
 * enough of the required crop at or above the required quality.
 */
export function canFulfillContract(
  inv: GameEntity["inventory"],
  contract: HarborContract,
): boolean {
  if (!inv) return false;
  const { crop, minQuality, quantity } = contract.goods;
  const total = inv.crops[crop] ?? 0;
  if (total < quantity) return false;

  // Quality check: count units at or above the minimum quality tier.
  const quality = inv.cropQuality?.[crop];
  if (!quality) {
    // No quality breakdown → all Normal. If minQuality is normal, OK.
    return minQuality === "normal";
  }
  // Count units that meet the quality floor.
  let qualifying = 0;
  if (minQuality === "normal") qualifying = quality.normal + quality.silver + quality.gold;
  else if (minQuality === "silver") qualifying = quality.silver + quality.gold;
  else qualifying = quality.gold;  // minQuality === "gold"
  return qualifying >= quantity;
}
