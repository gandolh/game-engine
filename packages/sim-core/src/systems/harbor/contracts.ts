
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

// Sorted by sell price; higher-value crops appear more often in gold contracts.
export const CONTRACT_CROPS: readonly CropKind[] = [
  "radish", "wheat", "carrot", "tomato", "corn",
  "pumpkin", "grape", "winter-squash",
];

export const CONTRACT_CROPS_HIGH: readonly CropKind[] = [
  "tomato", "corn", "pumpkin", "grape", "winter-squash",
];

export const TIER_MIN_QUALITY: Record<"normal" | "silver" | "gold", CropQuality> = {
  normal: "normal",
  silver: "normal",  // silver contracts: any quality acceptable
  gold:   "silver",  // gold contracts: need at least silver
};

export const TIER_QTY: Record<"normal" | "silver" | "gold", [number, number]> = {
  normal: [4,  8],
  silver: [6,  12],
  gold:   [8,  16],
};

/** Pure deterministic contract generation for a batch posted on `day`. */
export function generateContracts(
  day: number,
  count: number,
  rng: Rng,
  farmerReputations: number[],
): HarborContract[] {
  const contracts: HarborContract[] = [];
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

/** Returns true if the farmer's inventory can fulfill the contract's crop/quality/quantity. */
export function canFulfillContract(
  inv: GameEntity["inventory"],
  contract: HarborContract,
): boolean {
  if (!inv) return false;
  const { crop, minQuality, quantity } = contract.goods;
  const total = inv.crops[crop] ?? 0;
  if (total < quantity) return false;

  const quality = inv.cropQuality?.[crop];
  if (!quality) {
    // No quality breakdown → all Normal. If minQuality is normal, OK.
    return minQuality === "normal";
  }
  let qualifying = 0;
  if (minQuality === "normal") qualifying = quality.normal + quality.silver + quality.gold;
  else if (minQuality === "silver") qualifying = quality.silver + quality.gold;
  else qualifying = quality.gold;  // minQuality === "gold"
  return qualifying >= quantity;
}
