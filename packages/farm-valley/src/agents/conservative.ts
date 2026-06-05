import type { GameEntity, CropKind } from "../components";
import { recordReason, resetDecisionTrace } from "../components";
import { registerPersonality } from "./registry";
import {
  registerPeerTradeHooks,
} from "./peer-trade-registry";
import { makeRespondPeerOffer } from "./peer-trade-policy";
import { deliberateBean } from "./bean-valuation";
import { deliberateWatering, deliberateRefillCan, deliberateTill, deliberateBuyTool, deliberateResourceGather, deliberateDecoration, deliberateUpgrade, deliberateResourceZoneVisit, deliberateEarlyVillageVisit, deliberateSleep, deliberatePeriodicMarketVisit, deliberatePlantNearby } from "./watering";
import type { PlotWaterSense } from "../systems/plot-sense";
import type { TileFeature, FarmDecoration } from "../components";
import { SEED_COST, CROP_SEASON } from "../economy";
import { seasonForDay } from "../protocols/weather";

/**
 * brief 41 — pick the safest (cheapest, in-season) crop for the current day.
 * If seeds on hand include an in-season crop, plant it first (never wasteful).
 * Otherwise buy the cheapest in-season crop we can afford.
 * Conservative prefers: spring→carrot/radish, summer→tomato, autumn→pumpkin,
 * winter→winter-squash. Fallback to radish if nothing else affordable.
 */
function pickConservativeCrop(
  day: number,
  gold: number,
  reserve: number,
  seeds?: Record<CropKind, number>,
): { crop: CropKind; cost: number } {
  const season = seasonForDay(day);
  // Priority: use seeds already on hand (in-season first, cheapest).
  const inSeasonCheap: CropKind[] =
    season === "spring" ? ["carrot", "radish", "wheat"] :
    season === "summer" ? ["tomato", "corn"] :
    season === "autumn" ? ["pumpkin", "grape"] :
    ["winter-squash"];
  if (seeds !== undefined) {
    for (const crop of inSeasonCheap) {
      if (seeds[crop] >= 1) return { crop, cost: 0 };
    }
  }
  // No in-season seeds on hand — buy the cheapest in-season we can afford.
  for (const crop of inSeasonCheap) {
    const cost = SEED_COST[crop];
    if (gold - cost >= reserve) return { crop, cost };
  }
  // Fallback: radish is always affordable.
  return { crop: "radish", cost: SEED_COST.radish };
}

export function deliberateConservative(farmer: GameEntity): void {
  if (!farmer.beliefs || !farmer.desires || !farmer.intentions || !farmer.inventory) return;
  const reserve = (farmer.desires.data.minGoldReserve as number | undefined) ?? 30;
  const gold = farmer.inventory.gold;
  const seeds = farmer.inventory.seeds;
  const day = (farmer.beliefs.data.currentDay as number | undefined) ?? 0;
  const { crop: candidate, cost: seedCost } = pickConservativeCrop(day, gold, reserve, seeds);

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

  const season = seasonForDay(day);
  const cropSeason = CROP_SEASON[candidate];
  const seasonTag = season === cropSeason ? "in-season" : "off-season";
  if (gold - seedCost >= reserve && seeds[candidate] >= 1) {
    if (deliberatePlantNearby(farmer, candidate, 1)) {
      recordReason(farmer, `plant ${candidate}: ${seasonTag}, safe choice`);
    }
  } else if (gold - seedCost >= reserve) {
    farmer.intentions.queue.push({
      kind: "buy-seed",
      data: { crop: candidate, quantity: 1 },
      priority: 2,
    });
    recordReason(farmer, `buy seed ${candidate}: ${seasonTag}, short on seeds`);
  }

  const inVillage = farmer.farmer?.currentRegion === "village";
  // brief 41 — sell all crop kinds (dynamic, not hard-coded to 3).
  const allCrops = Object.keys(farmer.inventory.crops) as CropKind[];
  for (const crop of allCrops) {
    const qty = farmer.inventory.crops[crop];
    if (qty > 0) {
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
        data: { crop, quantity: qty },
        priority: 0,
      });
      const curSeason = seasonForDay(day);
      const cs = CROP_SEASON[crop];
      const seasonal = curSeason === cs ? "" : " (off-season)";
      recordReason(farmer, `sell ${crop}${seasonal} x${qty}`);
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

const CONS_PEER_BUY_CEILING = 1.0; // never over shop price
const CONS_PEER_SELL_FLOOR = 0.9;
const CONS_BUFFER_SEEDS = 1;

export const respondToPeerOfferConservative = makeRespondPeerOffer({
  buyCeiling: CONS_PEER_BUY_CEILING,
  sellFloor: CONS_PEER_SELL_FLOOR,
  bufferSeeds: CONS_BUFFER_SEEDS,
  reserveDefault: 30,
});

registerPeerTradeHooks("conservative", {
  respond: respondToPeerOfferConservative,
});
