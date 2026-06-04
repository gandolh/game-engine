// Opportunist farmer personality.
// Enqueues intentions: plant, buy-seed, sell-shopkeeper, post-offer, read-offers, buy-from-wall.
import type { GameEntity, CropKind } from "../components";
import { recordReason, resetDecisionTrace } from "../components";
import { registerPersonality, type DeliberateContext } from "./registry";
import { ONT_MARKET, type MarketOffer } from "../protocols/market";
import type { WeatherCondition } from "../protocols/weather";
import {
  registerPeerTradeHooks,
  type RespondPeerOfferFn,
} from "./peer-trade-registry";
import { deliberateBean } from "./bean-valuation";
import { deliberateWatering, deliberateRefillCan, deliberateTill, deliberateBuyTool, deliberateResourceGather, deliberateDecoration, deliberateUpgrade, deliberateResourceZoneVisit, deliberateEarlyVillageVisit, deliberateSleep, deliberatePeriodicMarketVisit, deliberateMillVisit, deliberateSeasonalForage } from "./watering";
import type { PlotWaterSense } from "../systems/plot-sense";
import type { TileFeature, FarmDecoration } from "../components";

const SHOP_PRICE: Record<CropKind, number> = { radish: 8, wheat: 14, pumpkin: 35 };
const SEED_COST: Record<CropKind, number> = { radish: 5, wheat: 8, pumpkin: 15 };
// Fair-price posting: between cost and shop ceiling.
const FAIR_PRICE: Record<CropKind, number> = { radish: 7, wheat: 12, pumpkin: 30 };
const LOW_SUPPLY_THRESHOLD = 3;
const BUY_PRICE_MULTIPLIER = 1.1; // willing to pay up to 110% of shop price

function pickCropFromWeather(forecast: WeatherCondition | undefined): CropKind {
  if (forecast === "storm" || forecast === "rainy") {
    // Wheat/radish under storm/rain. Prefer wheat (higher value) when affordable.
    return "wheat";
  }
  // Pumpkin/corn under sun. We only have pumpkin/wheat/radish — pumpkin is the high-tier sun crop.
  return "pumpkin";
}

function fallbackCrop(crop: CropKind, gold: number, reserve: number): CropKind {
  // If we can't afford the chosen crop's seed, slide down.
  if (gold - SEED_COST[crop] >= reserve) return crop;
  if (gold - SEED_COST.wheat >= reserve) return "wheat";
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

  // brief 29 — opportunist waters lazily (threshold 1), banking AP for trades.
  deliberateWatering(farmer, { dryThreshold: 1 });

  // Opportunist expands plots when it's profitable (medium expansion).
  const plotsOwned = sense?.planted ?? 0;
  if (plotsOwned < 8) {
    const occupied = new Set<string>((farmer.beliefs.data.occupiedTiles as string[] | undefined) ?? []);
    deliberateBuyTool(farmer, "hoe", 3);
    deliberateTill(farmer, occupied, 2, 4);
  }
  // Chop/mine when it's opportune (low priority).
  const features = (farmer.beliefs.data.tileFeatures as TileFeature[] | undefined) ?? [];
  deliberateResourceGather(farmer, features, 1, 8);

  // Craft decorations opportunistically — if it improves yield ROI.
  const decorations = (farmer.beliefs.data.decorations as FarmDecoration[] | undefined) ?? [];
  deliberateDecoration(farmer, decorations, 8);

  // Opportunist chases the mill premium when it has built up a surplus.
  deliberateMillVisit(farmer, 8, 6);
  // …and the in-season foraging zone for opportunistic gold.
  deliberateSeasonalForage(farmer, 7);

  // Opportunist visits village on day 0-1 — always wants market info early.
  deliberateEarlyVillageVisit(farmer, 5);
  // Upgrade pickaxe first (stones → geodes = high value), then hoe.
  deliberateUpgrade(farmer, "pickaxe", 9);
  deliberateUpgrade(farmer, "hoe",     10);
  // Travel to resource zones when own farm has nothing.
  deliberateResourceZoneVisit(farmer, features.length, "stone", 11);
  deliberateResourceZoneVisit(farmer, features.length, "tree",  12);

  // 1. Plant or buy seed based on weather forecast.
  const desired = pickCropFromWeather(forecast);
  const target = fallbackCrop(desired, farmer.inventory.gold, reserve);

  if (farmer.inventory.seeds[target] >= 1) {
    farmer.intentions.queue.push({
      kind: "plant",
      data: { crop: target },
      priority: 1,
    });
    recordReason(farmer, `plant ${target}: weather ${forecast ?? "n/a"}`);
  } else if (farmer.inventory.gold - SEED_COST[target] >= reserve) {
    farmer.intentions.queue.push({
      kind: "buy-seed",
      data: { crop: target, quantity: 1 },
      priority: 2,
    });
    recordReason(farmer, `buy seed ${target}: short on seeds`);
  }

  // 2. Supply-aware market posting: if I have stock, peek offer list (if perceived)
  //    and either post at fair price (low supply) or dump to shopkeeper (high supply).
  const offers = (farmer.beliefs.data["marketOffers"] as MarketOffer[] | undefined) ?? [];
  for (const crop of ["pumpkin", "wheat", "radish"] as const) {
    const qty = farmer.inventory.crops[crop];
    if (qty <= 0) continue;
    const supply = countOffersByCrop(offers, crop);
    if (supply < LOW_SUPPLY_THRESHOLD) {
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
      if (!inVillage) {
        farmer.intentions.queue.push({
          kind: "travel",
          data: { targetRegionId: "village" },
          priority: 3,
        });
        recordReason(farmer, `travel village: have crops to sell`);
      }
      farmer.intentions.queue.push({
        kind: "sell-shopkeeper",
        data: { crop, quantity: qty },
        priority: 3,
      });
      recordReason(farmer, `sell ${crop} x${qty}: high supply ${supply}`);
    }
  }

  // 3. Make sure we have a perceived offer list each day.
  farmer.intentions.queue.push({
    kind: "read-offers",
    data: { ontology: ONT_MARKET.READ_OFFERS },
    priority: 4,
  });
  recordReason(farmer, `read offers: check market`);

  // 4. Buy at most one offer per day — highest-trust seller priced <=110% of shop price.
  const trust = farmer.trust?.byId;
  let best: { offer: MarketOffer; trust: number } | null = null;
  for (const offer of offers) {
    if (offer.sellerId === farmer.id) continue;
    const ceiling = SHOP_PRICE[offer.crop] * BUY_PRICE_MULTIPLIER;
    if (offer.pricePerUnit > ceiling) continue;
    const cost = offer.pricePerUnit * offer.quantity;
    if (farmer.inventory.gold - cost < reserve) continue;
    // Trust is maintained live by TrustSystem; default to 0.5 for unseen peers.
    const t = trust?.get(offer.sellerId) ?? 0.5;
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

  // brief 24 — opportunist bids for arbitrage (well below resale value to lock
  // in margin) and flips beans for the spread.
  deliberateBean(farmer, 0.7);

  deliberatePeriodicMarketVisit(farmer, 3, 6);
  deliberateSleep(farmer);
  farmer.intentions.queue.sort((a, b) => a.priority - b.priority);
}

registerPersonality("opportunist", deliberateOpportunist);

// ---------------------------------------------------------------------------
// Peer-trade hooks (encounter-trade system)
// ---------------------------------------------------------------------------

const OPP_PEER_SHOP_SELL_PRICE: Record<CropKind, number> = {
  radish: 8,
  wheat: 14,
  pumpkin: 35,
};
const OPP_PEER_BUY_CEILING = 1.1; // matches wall heuristic
const OPP_PEER_SELL_FLOOR = 0.9;
const OPP_BUFFER_SEEDS = 1;

export const respondToPeerOfferOpportunist: RespondPeerOfferFn = (
  farmer,
  offer,
  _sender,
  _ctx,
) => {
  if (!farmer.inventory) return { decision: "decline", reason: "no-inventory" };
  const reserve =
    (farmer.desires?.data["minGoldReserve"] as number | undefined) ?? 50;
  const ref = OPP_PEER_SHOP_SELL_PRICE[offer.crop];

  if (offer.direction === "sell") {
    if (offer.unitPrice > ref * OPP_PEER_BUY_CEILING) {
      return { decision: "decline", reason: "price-too-high" };
    }
    const cost = offer.unitPrice * offer.quantity;
    if (farmer.inventory.gold - cost < reserve) {
      return { decision: "decline", reason: "would-breach-reserve" };
    }
    return { decision: "accept" };
  }

  if (offer.unitPrice < ref * OPP_PEER_SELL_FLOOR) {
    return { decision: "decline", reason: "price-too-low" };
  }
  if (
    farmer.inventory.seeds[offer.crop] <
    offer.quantity + OPP_BUFFER_SEEDS
  ) {
    return { decision: "decline", reason: "would-deplete-buffer" };
  }
  return { decision: "accept" };
};

registerPeerTradeHooks("opportunist", {
  respond: respondToPeerOfferOpportunist,
});
