import type { GameEntity, CropKind } from "../components";
import { recordReason, resetDecisionTrace } from "../components";
import { registerPersonality, type DeliberateContext } from "./registry";
import { ONT_MARKET, type MarketOffer } from "../protocols/market";
import type { WeatherCondition, Season } from "../protocols/weather";
import { seasonForDay } from "../protocols/weather";
import {
  registerPeerTradeHooks,
} from "./peer-trade-registry";
import { makeRespondPeerOffer, makeInitiatePeerTrade } from "./peer-trade-policy";
import { CROP_SELL_PRICE, SEED_COST, CROP_SEASON } from "../economy";
import { deliberateBean } from "./bean-valuation";
import { deliberateWatering, deliberateRefillCan, deliberateTill, deliberateBuyTool, deliberateResourceGather, deliberateDecoration, deliberateUpgrade, deliberateResourceZoneVisit, deliberateEarlyVillageVisit, deliberateSleep, deliberatePeriodicMarketVisit, deliberateMillVisit, deliberateSeasonalForage, deliberateFishing, deliberateCoralFishing, deliberatePlantNearby, deliberateBuildPen, deliberateBuyAnimal, deliberateTendPens, deliberateSellProducts, deliberatePlantOrchard, deliberateHarvestFruit, deliberateSellFruit, deliberateHireHelp, deliberateTavernGather, deliberateFestivalGather, deliberateHarborContract, deliberateShrineVisit, deliberatePortHop } from "./watering";
import type { PlotWaterSense } from "../systems/plot-sense";
import type { TileFeature, FarmDecoration } from "../components";
import type { HarborContract } from "../protocols/harbor";

// Fair-price posting: between cost and shop ceiling (intentionally below CROP_SELL_PRICE).
const FAIR_PRICE: Record<CropKind, number> = {
  radish:          7,
  wheat:           12,
  carrot:          10,
  tomato:          18,
  corn:            23,
  pumpkin:         30,
  grape:           44,
  "winter-squash": 19,
};
const LOW_SUPPLY_THRESHOLD = 3;
const BUY_PRICE_MULTIPLIER = 1.1; // willing to pay up to 110% of shop price

/** Picks best in-season crop, adjusted for weather forecast. */
function pickCropFromWeatherAndSeason(
  forecast: WeatherCondition | undefined,
  day: number,
): CropKind {
  const season = seasonForDay(day);
  const inSeason: Record<Season, CropKind[]> = {
    spring: ["wheat", "carrot", "radish"],
    summer: ["corn", "tomato"],
    autumn: ["grape", "pumpkin"],
    winter: ["winter-squash"],
  };
  const candidates = inSeason[season];
  if (forecast === "storm" || forecast === "rainy") {
    return candidates[candidates.length - 1]!; // cheapest/fastest in-season
  }
  return candidates[0]!; // most valuable in-season
}

function fallbackCrop(crop: CropKind, gold: number, reserve: number): CropKind {
  if (gold - SEED_COST[crop] >= reserve) return crop;
  const cheaper: CropKind[] = ["tomato", "carrot", "radish", "winter-squash", "wheat"];
  for (const c of cheaper) {
    if (gold - SEED_COST[c] >= reserve) return c;
  }
  return "radish";
}

function countOffersByCrop(offers: readonly MarketOffer[], crop: CropKind): number {
  let n = 0;
  for (const o of offers) if (o.crop === crop) n += 1;
  return n;
}

export function deliberateOpportunist(farmer: GameEntity, ctx: DeliberateContext): void {
  if (!farmer.beliefs || !farmer.desires || !farmer.intentions || !farmer.inventory) return;

  const reserve = (farmer.desires.data["minGoldReserve"] as number | undefined) ?? 50;
  const day = (farmer.beliefs.data["currentDay"] as number | undefined) ?? ctx.tick;
  const weather = farmer.beliefs.data["weather"] as
    | { current?: WeatherCondition; forecast?: WeatherCondition }
    | undefined;
  const forecast = weather?.forecast ?? weather?.current;
  const inVillage = farmer.farmer?.currentRegion === "village";

  farmer.intentions.queue.length = 0;
  resetDecisionTrace(farmer);

  const sense = farmer.beliefs.data.plotWater as PlotWaterSense | undefined;
  deliberateRefillCan(farmer, Math.min(sense?.due ?? 0, 2));
  // Waters lazily (threshold 1), banking AP for trades.
  deliberateWatering(farmer, { dryThreshold: 1 });

  const plotsOwned = sense?.planted ?? 0;
  if (plotsOwned < 8) {
    const occupied = new Set<string>((farmer.beliefs.data.occupiedTiles as string[] | undefined) ?? []);
    deliberateBuyTool(farmer, "hoe", 3);
    deliberateTill(farmer, occupied, 2, 4);
  }
  const features = (farmer.beliefs.data.tileFeatures as TileFeature[] | undefined) ?? [];
  deliberateResourceGather(farmer, features, 1, 8);

  const decorations = (farmer.beliefs.data.decorations as FarmDecoration[] | undefined) ?? [];
  deliberateDecoration(farmer, decorations, 8);

  deliberateMillVisit(farmer, 8, 6);
  deliberateSeasonalForage(farmer, 7);
  deliberateFishing(farmer, 5, 3, 13);
  // Coral: fishing-leaning archetype — most frequent trips, modest AP floor (40).
  deliberateCoralFishing(farmer, 6, 3, -2, 40);

  deliberateEarlyVillageVisit(farmer, 5);
  // Upgrade pickaxe first (stones → geodes = high value).
  deliberateUpgrade(farmer, "pickaxe", 9);
  deliberateUpgrade(farmer, "hoe",     10);
  deliberateResourceZoneVisit(farmer, features.length, "stone", 11);
  deliberateResourceZoneVisit(farmer, features.length, "tree",  12);

  const desired = pickCropFromWeatherAndSeason(forecast, day);
  const target = fallbackCrop(desired, farmer.inventory.gold, reserve);
  const cropSeason = CROP_SEASON[target];
  const currentSeason = seasonForDay(day);
  const seasonNote = currentSeason === cropSeason ? "in-season" : "off-season";

  if (farmer.inventory.seeds[target] >= 1) {
    if (deliberatePlantNearby(farmer, target, 1)) {
      recordReason(farmer, `plant ${target}: ${seasonNote}, weather ${forecast ?? "n/a"}`);
    }
  } else if (farmer.inventory.gold - SEED_COST[target] >= reserve) {
    farmer.intentions.queue.push({
      kind: "buy-seed",
      data: { crop: target, quantity: 1 },
      priority: 2,
    });
    recordReason(farmer, `buy seed ${target}: ${seasonNote}, short on seeds`);
  }

  // Post at fair price when supply < threshold; dump to shopkeeper when high supply
  // or gold < half reserve (liquidity fallback).
  const offers = (farmer.beliefs.data["marketOffers"] as MarketOffer[] | undefined) ?? [];
  const needsLiquidity = farmer.inventory.gold < reserve * 0.5;
  for (const crop of Object.keys(farmer.inventory.crops) as CropKind[]) {
    const qty = farmer.inventory.crops[crop];
    if (qty <= 0) continue;
    const supply = countOffersByCrop(offers, crop);
    if (!needsLiquidity && supply < LOW_SUPPLY_THRESHOLD) {
      if (!inVillage) {
        farmer.intentions.queue.push({
          kind: "travel",
          data: { targetRegionId: "village" },
          priority: 3,
        });
        recordReason(farmer, `travel village: post offers`);
      }
      farmer.intentions.queue.push({
        kind: "post-offer",
        data: {
          ontology: ONT_MARKET.POST_OFFER,
          crop,
          quantity: qty,
          pricePerUnit: FAIR_PRICE[crop],
        },
        priority: 3,
      });
      recordReason(farmer, `post offer ${crop} x${qty} @ ${FAIR_PRICE[crop]}: low supply ${supply}`);
    } else {
      farmer.intentions.queue.push({
        kind: "sell-shopkeeper",
        data: { crop, quantity: qty },
        priority: 3,
      });
      recordReason(farmer, needsLiquidity
        ? `sell ${crop} x${qty}: liquidity fallback (gold ${farmer.inventory.gold} < ${Math.floor(reserve * 0.5)})`
        : `sell ${crop} x${qty}: high supply ${supply}`);
    }
  }

  farmer.intentions.queue.push({
    kind: "read-offers",
    data: { ontology: ONT_MARKET.READ_OFFERS },
    priority: 4,
  });
  recordReason(farmer, `read offers: check market`);

  // Buy at most one wall offer per day — highest-trust seller at ≤110% of shop.
  const trust = farmer.trust?.byId;
  let best: { offer: MarketOffer; trust: number } | null = null;
  for (const offer of offers) {
    if (offer.sellerId === farmer.id) continue;
    const ceiling = CROP_SELL_PRICE[offer.crop] * BUY_PRICE_MULTIPLIER;
    if (offer.pricePerUnit > ceiling) continue;
    const cost = offer.pricePerUnit * offer.quantity;
    if (farmer.inventory.gold - cost < reserve) continue;
    const t = trust?.get(offer.sellerId) ?? 0.5; // default 0.5 for unseen peers
    if (best === null || t > best.trust) {
      best = { offer, trust: t };
    }
  }
  if (best) {
    if (!inVillage) {
      farmer.intentions.queue.push({
        kind: "travel",
        data: { targetRegionId: "village" },
        priority: 5,
      });
      recordReason(farmer, `travel village: buy wall offer`);
    }
    farmer.intentions.queue.push({
      kind: "buy-from-wall",
      data: {
        offerId: best.offer.offerId,
        pricePerUnit: best.offer.pricePerUnit,
        quantity: best.offer.quantity,
      },
      priority: 5,
    });
    recordReason(
      farmer,
      `buy wall ${best.offer.crop} x${best.offer.quantity} @ ${best.offer.pricePerUnit}: trust ${best.trust.toFixed(2)}`,
    );
  }

  // Bids for arbitrage at 0.7 of resale and flips beans for the spread.
  deliberateBean(farmer, 0.7);

  deliberatePeriodicMarketVisit(farmer, 3, 6);

  // Diversifies with a modest coop + single apple orchard on genuine surplus only.
  const oppSurplus = farmer.inventory.gold >= reserve + 50;
  const oppUrgent = (sense?.maxDrySoFar ?? 0) >= 2;
  const oppAp = (farmer.ap?.current ?? 0) >= 20;
  const oppQuiet = oppSurplus && !oppUrgent && oppAp;
  const oppHasCoop = (farmer.beliefs.data["hasPen_coop"] as boolean | undefined) ?? false;
  const oppChickens = (farmer.beliefs.data["penCount_chicken"] as number | undefined) ?? 0;
  const oppOrchards = (farmer.beliefs.data["orchardCount"] as number | undefined) ?? 0;
  if (day >= 8) {
    const orchardCommit = oppQuiet && oppOrchards < 1;
    deliberatePlantOrchard(farmer, "apple", 1, reserve + 5, 16, orchardCommit ? -2 : undefined);
    deliberateHarvestFruit(farmer, 4);
    deliberateSellFruit(farmer, 6);
    deliberateTendPens(farmer, 5);
    deliberateSellProducts(farmer, 6);
    if (oppQuiet && oppOrchards >= 1) {
      if (!oppHasCoop) deliberateBuildPen(farmer, "coop", "chicken", reserve + 5, 14, -2);
      if (oppHasCoop && oppChickens < 2) deliberateBuyAnimal(farmer, "chicken", reserve + 5, 15, -2);
    }
  }

  deliberateHireHelp(farmer, reserve, 13, -2);
  // Shrine: opportunist only — AP top-up when starved + off-cooldown.
  deliberateShrineVisit(farmer, 12, -2);

  // riskTolerance baked per-agent (bdi-jitter.ts, ~0.7): most likely to speculate on grow-then-deliver.
  const openContracts = (farmer.beliefs?.data.harborOpenContracts as HarborContract[] | undefined) ?? [];
  if (day >= 3) {
    const tol = (farmer.desires.data.riskTolerance as number | undefined) ?? 0.7;
    deliberateHarborContract(farmer, openContracts, tol, reserve, 5, -2);
  }

  deliberateTavernGather(farmer, -2);
  deliberateFestivalGather(farmer, -2);
  // Light periodic port-hop — discretionary, high AP floor, low precedence so it
  // never preempts real work but adds visible boat traffic.
  deliberatePortHop(farmer, 9, 6, 140);
  deliberateSleep(farmer);
  farmer.intentions.queue.sort((a, b) => a.priority - b.priority);
}

registerPersonality("opportunist", deliberateOpportunist);

const OPP_PEER_BUY_CEILING = 1.1; // matches wall heuristic
const OPP_PEER_SELL_FLOOR = 0.9;
const OPP_BUFFER_SEEDS = 1;

export const respondToPeerOfferOpportunist = makeRespondPeerOffer({
  buyCeiling: OPP_PEER_BUY_CEILING,
  sellFloor: OPP_PEER_SELL_FLOOR,
  bufferSeeds: OPP_BUFFER_SEEDS,
  reserveDefault: 50,
});

// Keenest crop buyer: snaps up peers' surplus at ≤ shop value (1.0) to resell at the wall.
export const respondCropOfferOpportunist = makeRespondPeerOffer({
  commodity: "crop",
  buyCeiling: 1.0, // buys crops at or below shop value (resale margin)
  sellFloor: 0.9,
  bufferSeeds: 0,
  reserveDefault: 50,
});

registerPeerTradeHooks("opportunist", {
  respond: respondToPeerOfferOpportunist,
  respondCrop: respondCropOfferOpportunist,
});
