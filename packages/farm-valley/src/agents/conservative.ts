import type { GameEntity, CropKind } from "../components";
import { recordReason, resetDecisionTrace } from "../components";
import { registerPersonality } from "./registry";
import {
  registerPeerTradeHooks,
  type RespondPeerOfferFn,
} from "./peer-trade-registry";
import { deliberateBean } from "./bean-valuation";

export function deliberateConservative(farmer: GameEntity): void {
  if (!farmer.beliefs || !farmer.desires || !farmer.intentions || !farmer.inventory) return;
  const reserve = (farmer.desires.data.minGoldReserve as number | undefined) ?? 30;
  const gold = farmer.inventory.gold;
  const seeds = farmer.inventory.seeds;
  const candidate: CropKind = "radish";
  const seedCost = 5;

  farmer.intentions.queue.length = 0;
  resetDecisionTrace(farmer);

  if (gold - seedCost >= reserve && seeds[candidate] >= 1) {
    farmer.intentions.queue.push({
      kind: "plant",
      data: { crop: candidate },
      priority: 1,
    });
    recordReason(farmer, `plant ${candidate}: gold ${gold} >= reserve ${reserve}`);
  } else if (gold - seedCost >= reserve) {
    farmer.intentions.queue.push({
      kind: "buy-seed",
      data: { crop: candidate, quantity: 1 },
      priority: 2,
    });
    recordReason(farmer, `buy seed ${candidate}: short on seeds`);
  }

  const inVillage = farmer.farmer?.currentRegion === "village";
  for (const crop of (["radish", "wheat", "pumpkin"] as const)) {
    if (farmer.inventory.crops[crop] > 0) {
      if (!inVillage) {
        farmer.intentions.queue.push({
          kind: "travel",
          data: { targetRegionId: "village" },
          priority: 0,
        });
        recordReason(farmer, `travel village: have crops to sell`);
      }
      farmer.intentions.queue.push({
        kind: "sell-shopkeeper",
        data: { crop, quantity: farmer.inventory.crops[crop] },
        priority: 0,
      });
      recordReason(farmer, `sell ${crop} x${farmer.inventory.crops[crop]}`);
    }
  }

  // brief 24 — bid cautiously (near reserve) and flip any beans held.
  deliberateBean(farmer, 0.45);

  farmer.intentions.queue.sort((a, b) => a.priority - b.priority);
}

registerPersonality("conservative", deliberateConservative);

// ---------------------------------------------------------------------------
// Peer-trade hooks (encounter-trade system)
// ---------------------------------------------------------------------------

const CONS_PEER_SHOP_SELL_PRICE: Record<CropKind, number> = {
  radish: 8,
  wheat: 14,
  pumpkin: 35,
};
const CONS_PEER_BUY_CEILING = 1.0; // never over shop price
const CONS_PEER_SELL_FLOOR = 0.9;
const CONS_BUFFER_SEEDS = 1;

export const respondToPeerOfferConservative: RespondPeerOfferFn = (
  farmer,
  offer,
  _sender,
  _ctx,
) => {
  if (!farmer.inventory) return { decision: "decline", reason: "no-inventory" };
  const reserve =
    (farmer.desires?.data["minGoldReserve"] as number | undefined) ?? 30;
  const ref = CONS_PEER_SHOP_SELL_PRICE[offer.crop];

  if (offer.direction === "sell") {
    if (offer.unitPrice > ref * CONS_PEER_BUY_CEILING) {
      return { decision: "decline", reason: "price-too-high" };
    }
    const cost = offer.unitPrice * offer.quantity;
    if (farmer.inventory.gold - cost < reserve) {
      return { decision: "decline", reason: "would-breach-reserve" };
    }
    return { decision: "accept" };
  }

  if (offer.unitPrice < ref * CONS_PEER_SELL_FLOOR) {
    return { decision: "decline", reason: "price-too-low" };
  }
  if (
    farmer.inventory.seeds[offer.crop] <
    offer.quantity + CONS_BUFFER_SEEDS
  ) {
    return { decision: "decline", reason: "would-deplete-buffer" };
  }
  return { decision: "accept" };
};

registerPeerTradeHooks("conservative", {
  respond: respondToPeerOfferConservative,
});
