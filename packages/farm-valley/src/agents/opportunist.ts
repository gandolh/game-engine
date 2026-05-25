// Opportunist farmer personality.
// Enqueues intentions: plant, buy-seed, sell-shopkeeper, post-offer, read-offers, buy-from-wall.
import type { GameEntity, CropKind } from "../components";
import { registerPersonality, type DeliberateContext } from "./registry";
import { ONT_MARKET, type MarketOffer } from "../protocols/market";
import type { WeatherCondition } from "../protocols/weather";

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

  farmer.intentions.queue.length = 0;

  // 1. Plant or buy seed based on weather forecast.
  const desired = pickCropFromWeather(forecast);
  const target = fallbackCrop(desired, farmer.inventory.gold, reserve);

  if (farmer.inventory.seeds[target] >= 1) {
    farmer.intentions.queue.push({
      kind: "plant",
      data: { crop: target },
      priority: 1,
    });
  } else if (farmer.inventory.gold - SEED_COST[target] >= reserve) {
    farmer.intentions.queue.push({
      kind: "buy-seed",
      data: { crop: target, quantity: 1 },
      priority: 2,
    });
  }

  // 2. Supply-aware market posting: if I have stock, peek offer list (if perceived)
  //    and either post at fair price (low supply) or dump to shopkeeper (high supply).
  const offers = (farmer.beliefs.data["marketOffers"] as MarketOffer[] | undefined) ?? [];
  for (const crop of ["pumpkin", "wheat", "radish"] as const) {
    const qty = farmer.inventory.crops[crop];
    if (qty <= 0) continue;
    const supply = countOffersByCrop(offers, crop);
    if (supply < LOW_SUPPLY_THRESHOLD) {
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
    } else {
      farmer.intentions.queue.push({
        kind: "sell-shopkeeper",
        data: { crop, quantity: qty },
        priority: 3,
      });
    }
  }

  // 3. Make sure we have a perceived offer list each day.
  farmer.intentions.queue.push({
    kind: "read-offers",
    data: { ontology: ONT_MARKET.READ_OFFERS },
    priority: 4,
  });

  // 4. Buy at most one offer per day — highest-trust seller priced <=110% of shop price.
  const trust = farmer.trust?.byId;
  let best: { offer: MarketOffer; trust: number } | null = null;
  for (const offer of offers) {
    if (offer.sellerId === farmer.id) continue;
    const ceiling = SHOP_PRICE[offer.crop] * BUY_PRICE_MULTIPLIER;
    if (offer.pricePerUnit > ceiling) continue;
    const cost = offer.pricePerUnit * offer.quantity;
    if (farmer.inventory.gold - cost < reserve) continue;
    // TODO: real trust updates land in a future ticket; default to 0.5 for unseen peers.
    const t = trust?.get(offer.sellerId) ?? 0.5;
    if (best === null || t > best.trust) {
      best = { offer, trust: t };
    }
  }
  if (best) {
    farmer.intentions.queue.push({
      kind: "buy-from-wall",
      data: {
        offerId: best.offer.offerId,
        pricePerUnit: best.offer.pricePerUnit,
        quantity: best.offer.quantity,
      },
      priority: 5,
    });
  }

  farmer.intentions.queue.sort((a, b) => a.priority - b.priority);
}

registerPersonality("opportunist", deliberateOpportunist);
