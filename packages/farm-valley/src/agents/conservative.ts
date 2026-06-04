import type { GameEntity, CropKind } from "../components";
import { recordReason, resetDecisionTrace } from "../components";
import { registerPersonality } from "./registry";
import {
  registerPeerTradeHooks,
  type RespondPeerOfferFn,
} from "./peer-trade-registry";
import { deliberateBean } from "./bean-valuation";
import { deliberateWatering, deliberateRefillCan, deliberateTill, deliberateBuyTool, deliberateResourceGather, deliberateDecoration, deliberateUpgrade, deliberateResourceZoneVisit, deliberateEarlyVillageVisit, deliberateSleep, deliberatePeriodicMarketVisit } from "./watering";
import type { PlotWaterSense } from "../systems/plot-sense";
import type { TileFeature, FarmDecoration } from "../components";

export function deliberateConservative(farmer: GameEntity): void {
  if (!farmer.beliefs || !farmer.desires || !farmer.intentions || !farmer.inventory) return;
  const reserve = (farmer.desires.data.minGoldReserve as number | undefined) ?? 30;
  const gold = farmer.inventory.gold;
  const seeds = farmer.inventory.seeds;
  const candidate: CropKind = "radish";
  const seedCost = 5;

  farmer.intentions.queue.length = 0;
  resetDecisionTrace(farmer);

  // Refill watering can if needed before watering.
  const sense = farmer.beliefs.data.plotWater as PlotWaterSense | undefined;
  const planWater = sense?.due ?? 0;
  deliberateRefillCan(farmer, planWater);

  // brief 29 — conservative waters early, never risking the grace window.
  deliberateWatering(farmer, { dryThreshold: 0 });

  // Till up to 2 new plots if we have seeds and a hoe (conservative expands slowly).
  const plotsOwned = (farmer.beliefs.data.plotWater as PlotWaterSense | undefined)?.planted ?? 0;
  if (plotsOwned < 6 && gold >= reserve + seedCost) {
    const occupied = new Set<string>(
      ((farmer.beliefs.data.occupiedTiles as string[] | undefined) ?? [])
    );
    deliberateBuyTool(farmer, "hoe", 1);
    deliberateTill(farmer, occupied, 1, 2);
  }

  // Chop/mine on own farm (low priority — opportunistic).
  const features = (farmer.beliefs.data.tileFeatures as TileFeature[] | undefined) ?? [];
  deliberateResourceGather(farmer, features, 1, 8);

  // Craft decorations when we have wood (conservative: low priority, affordable ones).
  const decorations = (farmer.beliefs.data.decorations as FarmDecoration[] | undefined) ?? [];
  deliberateDecoration(farmer, decorations, 9);

  // Visit village day 0-1 to scout market (gets everyone walking early).
  deliberateEarlyVillageVisit(farmer, 10);
  // Upgrade hoe first (conservative farms a lot), then axe for wood.
  deliberateUpgrade(farmer, "hoe", 11);
  deliberateUpgrade(farmer, "axe", 12);
  // Visit resource zones when own farm has nothing left to gather.
  deliberateResourceZoneVisit(farmer, features.length, "tree", 13);

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

  deliberatePeriodicMarketVisit(farmer, 3, 6);
  deliberateSleep(farmer);
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
