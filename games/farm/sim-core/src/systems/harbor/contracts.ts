
import type { Rng } from "@engine/core";
import type { GameEntity } from "../../components";
import {
  CONTRACT_REWARD_MULT,
  CONTRACT_REP_REWARD,
  CONTRACT_DEADLINE_DAYS,
  HARBOR_REP_THRESHOLD,
  CONTRACT_SIZE_QTY,
  CONTRACT_SIZE_MULT,
  CONTRACT_SIZE_REP_SCALE,
} from "../../economy";
import { CROP_SELL_PRICE } from "../../economy";
import type { CropKind, CropQuality } from "../../components";
import type { HarborContract, ContractSize } from "../../protocols/harbor";

export const CONTRACT_CROPS: readonly CropKind[] = [
  "radish", "wheat", "carrot", "tomato", "corn",
  "pumpkin", "grape", "winter-squash",
];

export const CONTRACT_CROPS_HIGH: readonly CropKind[] = [
  "tomato", "corn", "pumpkin", "grape", "winter-squash",
];

export const TIER_MIN_QUALITY: Record<"normal" | "silver" | "gold", CropQuality> = {
  normal: "normal",
  silver: "normal",  
  gold:   "silver",  
};

export const TIER_QTY: Record<"normal" | "silver" | "gold", [number, number]> = {
  normal: [4,  8],
  silver: [6,  12],
  gold:   [8,  16],
};

// Size is only rolled within the "normal" tier (always available, rep 0) —
// silver/gold stay single-size ("large"), i.e. today's rare, hoarder-shaped
// big hauls, untouched by this brief. See ContractSize's doc comment.
export const CONTRACT_SIZES: readonly ContractSize[] = ["small", "medium", "large"];

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
    const size: ContractSize = tier === "normal" ? rng.pick(CONTRACT_SIZES) : "large";
    const [minQty, maxQty] = size === "large" ? TIER_QTY[tier] : CONTRACT_SIZE_QTY[size];
    const quantity = rng.int(minQty, maxQty + 1);
    const baseSell = CROP_SELL_PRICE[crop];
    const rewardMult = size === "large" ? CONTRACT_REWARD_MULT[tier] : CONTRACT_SIZE_MULT[size];
    const reward = Math.round(baseSell * rewardMult * quantity);
    const reputationReward = size === "large"
      ? CONTRACT_REP_REWARD[tier]
      : Math.max(1, Math.round(CONTRACT_REP_REWARD[tier] * CONTRACT_SIZE_REP_SCALE[size]));
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
      size,
    });
  }
  return contracts;
}

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

    return minQuality === "normal";
  }
  let qualifying = 0;
  if (minQuality === "normal") qualifying = quality.normal + quality.silver + quality.gold;
  else if (minQuality === "silver") qualifying = quality.silver + quality.gold;
  else qualifying = quality.gold;  
  return qualifying >= quantity;
}
