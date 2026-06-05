// Hoarder farmer personality — buys radishes from the market wall, reads offers.
// Enqueues intentions: plant, buy-seed, read-offers, buy-from-wall.
import type { GameEntity, CropKind } from "../components";
import { recordReason, resetDecisionTrace } from "../components";
import { registerPersonality, type DeliberateContext } from "./registry";
import { ONT_MARKET, type MarketOffer } from "../protocols/market";
import {
  _resetCnpCoordinatorsForTests,
} from "./cnp-registry";
import {
  registerPeerTradeHooks,
  type InitiatePeerTradeFn,
} from "./peer-trade-registry";
import { makeRespondPeerOffer } from "./peer-trade-policy";
import { CROP_SELL_PRICE, SEED_COST, CROP_SEASON } from "../economy";
import { seasonForDay } from "../protocols/weather";
import { deliberateBean } from "./bean-valuation";
import { deliberateWatering, deliberateRefillCan, deliberateTill, deliberateBuyTool, deliberateResourceGather, deliberateDecoration, deliberateUpgrade, deliberateResourceZoneVisit, deliberateEarlyVillageVisit, deliberateSleep, deliberatePeriodicMarketVisit, deliberateSeasonalForage, deliberatePlantNearby } from "./watering";
import type { PlotWaterSense } from "../systems/plot-sense";
import type { TileFeature, FarmDecoration } from "../components";

export { _resetCnpCoordinatorsForTests };

const BUY_PRICE_MULTIPLIER = 1.05; // up to 105% of shop price

/**
 * brief 41 — hoarder picks the highest-value in-season crop they can afford
 * (hoards the good stuff). Falls back to radish only when nothing else works.
 */
function pickHoarderCrop(day: number, gold: number, reserve: number): CropKind {
  const season = seasonForDay(day);
  // Highest-value in-season crops by season.
  const seasonPrefs: Record<import("../protocols/weather").Season, CropKind[]> = {
    spring: ["wheat", "carrot", "radish"],
    summer: ["corn", "tomato"],
    autumn: ["grape", "pumpkin"],
    winter: ["winter-squash"],
  };
  const preferred = seasonPrefs[season];
  for (const crop of preferred) {
    if (gold - SEED_COST[crop] >= reserve) return crop;
  }
  return "radish";
}

export function deliberateHoarder(farmer: GameEntity, ctx: DeliberateContext): void {
  if (!farmer.beliefs || !farmer.desires || !farmer.intentions || !farmer.inventory) return;
  if (farmer.id === undefined) return;

  const reserve = (farmer.desires.data["minGoldReserve"] as number | undefined) ?? 80;
  const inVillage = farmer.farmer?.currentRegion === "village";

  farmer.intentions.queue.length = 0;
  resetDecisionTrace(farmer);

  // Hoarder always refills before watering (never risks running dry).
  const sense = farmer.beliefs.data.plotWater as PlotWaterSense | undefined;
  deliberateRefillCan(farmer, sense?.due ?? 0);

  // brief 29 — the hoarder waters everything religiously (threshold 0).
  deliberateWatering(farmer, { dryThreshold: 0 });

  // Expand slowly (hoarder carefully tends a medium plot count).
  const plotsOwned = sense?.planted ?? 0;
  if (plotsOwned < 7) {
    const occupied = new Set<string>((farmer.beliefs.data.occupiedTiles as string[] | undefined) ?? []);
    deliberateBuyTool(farmer, "hoe", 2);
    deliberateTill(farmer, occupied, 1, 3);
  }
  // Mine/chop occasionally — hoarder likes accumulating resources.
  const features = (farmer.beliefs.data.tileFeatures as TileFeature[] | undefined) ?? [];
  deliberateResourceGather(farmer, features, 1, 9);

  // Craft decorations — hoarder invests in yield (moderate priority).
  const decorations = (farmer.beliefs.data.decorations as FarmDecoration[] | undefined) ?? [];
  deliberateDecoration(farmer, decorations, 7);

  // Hoarder forages the in-season seasonal zone for extra gold.
  deliberateSeasonalForage(farmer, 8);

  // Visit village day 0-1 (hoarder wants to see prices before committing).
  deliberateEarlyVillageVisit(farmer, 8);
  // Hoarder upgrades all tools evenly — more yield = more to hoard.
  deliberateUpgrade(farmer, "hoe",     9);
  deliberateUpgrade(farmer, "axe",     10);
  deliberateUpgrade(farmer, "pickaxe", 11);
  // Visit resource zones when own farm depleted.
  deliberateResourceZoneVisit(farmer, features.length, "tree",  12);
  deliberateResourceZoneVisit(farmer, features.length, "stone", 13);

  // 1. brief 41 — plant the highest-value in-season crop we can afford; hoarder
  //    picks by reserve comfort AND season. Falls back through seeds on hand.
  const day = (farmer.beliefs.data["currentDay"] as number | undefined) ?? 0;
  const preferred = pickHoarderCrop(day, farmer.inventory.gold, reserve);
  const cropSeason = CROP_SEASON[preferred];
  const currentSeason = seasonForDay(day);
  const seasonNote = currentSeason === cropSeason ? "in-season premium" : "fallback";

  let chosen: CropKind | null = null;
  let chosenMode: "plant" | "buy-seed" = "plant";

  if (farmer.inventory.seeds[preferred] >= 1) {
    chosen = preferred;
  } else if (farmer.inventory.gold - SEED_COST[preferred] >= reserve) {
    chosen = preferred;
    chosenMode = "buy-seed";
  } else {
    // Try other available seeds.
    for (const crop of Object.keys(farmer.inventory.seeds) as CropKind[]) {
      if (crop !== preferred && farmer.inventory.seeds[crop] >= 1) {
        chosen = crop;
        break;
      }
    }
    if (!chosen && farmer.inventory.gold - SEED_COST.radish >= reserve) {
      chosen = "radish";
      chosenMode = "buy-seed";
    }
  }

  if (chosen) {
    if (chosenMode === "plant") {
      if (deliberatePlantNearby(farmer, chosen, 1)) {
        recordReason(farmer, `plant ${chosen}: ${seasonNote}`);
      }
    } else {
      farmer.intentions.queue.push({
        kind: "buy-seed",
        data: { crop: chosen, quantity: 1 },
        priority: 2,
      });
      recordReason(farmer, `buy seed ${chosen}: ${seasonNote}`);
    }
  }

  // 2. Read the market wall and buy radish offers up to 105% of shop price,
  //    prioritized by trust score (highest trust first).
  farmer.intentions.queue.push({
    kind: "read-offers",
    data: { ontology: ONT_MARKET.READ_OFFERS, filter: { crop: "radish" } },
    priority: 5,
  });
  recordReason(farmer, `read offers: scan radish wall`);

  const offers = (farmer.beliefs.data["marketOffers"] as MarketOffer[] | undefined) ?? [];
  const trust = farmer.trust?.byId;
  // Trust is maintained live by TrustSystem; default to 0.5 for unseen peers.
  const ranked = offers
    .filter((o) => o.sellerId !== farmer.id)
    .filter((o) => o.pricePerUnit <= CROP_SELL_PRICE[o.crop] * BUY_PRICE_MULTIPLIER)
    .map((o) => ({ o, t: trust?.get(o.sellerId) ?? 0.5 }))
    .sort((a, b) => {
      if (b.t !== a.t) return b.t - a.t;
      // Tie-break by lowest seller id for determinism.
      return a.o.sellerId - b.o.sellerId;
    });

  let budget = farmer.inventory.gold - reserve;
  for (const { o } of ranked) {
    const cost = o.pricePerUnit * o.quantity;
    if (cost > budget) continue;
    if (!inVillage) {
      farmer.intentions.queue.push({
        kind: "travel",
        data: { targetRegionId: "village" },
        priority: 6,
      });
      recordReason(farmer, `travel village: buy radish wall`);
    }
    farmer.intentions.queue.push({
      kind: "buy-from-wall",
      data: {
        offerId: o.offerId,
        pricePerUnit: o.pricePerUnit,
        quantity: o.quantity,
      },
      priority: 6,
    });
    recordReason(farmer, `buy wall ${o.crop} x${o.quantity} @ ${o.pricePerUnit}`);
    budget -= cost;
  }

  // brief 24 — hoarder bids hard to WIN the scarce bean (deny others) and then
  // HOLDS it (no resale — a hoarder hoards).
  deliberateBean(farmer, 0.9, { resell: false });

  deliberatePeriodicMarketVisit(farmer, 3, 6);
  deliberateSleep(farmer);
  farmer.intentions.queue.sort((a, b) => a.priority - b.priority);
}

registerPersonality("hoarder", deliberateHoarder);

// ---------------------------------------------------------------------------
// Peer-trade hooks (encounter-trade system)
// ---------------------------------------------------------------------------

const HOARDER_INITIATE_QTY = 3;
const HOARDER_INITIATE_PRICE_RADISH = 4.5;
const HOARDER_BUFFER_SEEDS = 2;
const HOARDER_PEER_BUY_CEILING = 1.05;
const HOARDER_PEER_SELL_FLOOR = 0.95;

export const initiatePeerTradeHoarder: InitiatePeerTradeFn = (
  farmer,
  meet,
  ctx,
) => {
  if (!farmer.inventory || farmer.id === undefined) return null;
  const reserve =
    (farmer.desires?.data["minGoldReserve"] as number | undefined) ?? 80;
  const day =
    (farmer.beliefs?.data["currentDay"] as number | undefined) ?? ctx.tick;

  const crop: CropKind = "radish";
  const qty = HOARDER_INITIATE_QTY;
  const unitPrice = HOARDER_INITIATE_PRICE_RADISH;

  // Don't initiate if hoarder already has enough radish seeds.
  if (farmer.inventory.seeds[crop] >= qty) return null;
  // Don't initiate if it would dip below reserve.
  if (farmer.inventory.gold - unitPrice * qty < reserve) return null;

  return {
    offerId: `peer-${farmer.id}-${meet.peerId}-${ctx.tick}-${day}-${crop}`,
    crop,
    quantity: qty,
    unitPrice,
    direction: "buy",
  };
};

export const respondToPeerOfferHoarder = makeRespondPeerOffer({
  buyCeiling: HOARDER_PEER_BUY_CEILING,
  sellFloor: HOARDER_PEER_SELL_FLOOR,
  bufferSeeds: HOARDER_BUFFER_SEEDS,
  reserveDefault: 80,
});

registerPeerTradeHooks("hoarder", {
  initiate: initiatePeerTradeHoarder,
  respond: respondToPeerOfferHoarder,
});
