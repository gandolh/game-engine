// Aggressive farmer personality.
// Enqueues intentions: plant, buy-seed, sell-shopkeeper, post-offer, read-offers, buy-from-wall.
import type { GameEntity, CropKind } from "../components";
import { registerPersonality, type DeliberateContext } from "./registry";
import { ONT_MARKET, type MarketOffer } from "../protocols/market";
import {
  registerPeerTradeHooks,
  type RespondPeerOfferFn,
} from "./peer-trade-registry";

// Shopkeeper reference prices for now (constants from spec).
const SHOP_PRICE: Record<CropKind, number> = { radish: 8, wheat: 14, pumpkin: 35 };
const SEED_COST: Record<CropKind, number> = { radish: 5, wheat: 8, pumpkin: 15 };
const PROFITABILITY_ORDER: readonly CropKind[] = ["pumpkin", "wheat", "radish"];
// priceMax: aggressive posts at the shopkeeper price (the market ceiling for the crop).
const PRICE_MAX: Record<CropKind, number> = { radish: 8, wheat: 14, pumpkin: 35 };
const UNDERCUT_THRESHOLD = 0.9; // buy offers below 90% of shop price

function pickCropForWeather(condition: string | undefined): CropKind | null {
  // Storm/rainy => downgrade to radish.
  if (condition === "storm" || condition === "rainy") return "radish";
  return null;
}

function chooseTargetCrop(
  farmer: GameEntity,
  reserve: number,
): { crop: CropKind; mode: "plant" | "buy-seed" } | null {
  if (!farmer.inventory) return null;
  const gold = farmer.inventory.gold;
  const weather = (farmer.beliefs?.data["weather"] as { current?: string } | undefined)?.current;
  const forced = pickCropForWeather(weather);
  const order: readonly CropKind[] = forced ? [forced] : PROFITABILITY_ORDER;

  for (const crop of order) {
    if (farmer.inventory.seeds[crop] >= 1) {
      return { crop, mode: "plant" };
    }
  }
  for (const crop of order) {
    const cost = SEED_COST[crop];
    if (gold - cost >= reserve) {
      return { crop, mode: "buy-seed" };
    }
  }
  return null;
}

export function deliberateAggressive(farmer: GameEntity, ctx: DeliberateContext): void {
  if (!farmer.beliefs || !farmer.desires || !farmer.intentions || !farmer.inventory) return;

  const reserve = (farmer.desires.data["minGoldReserve"] as number | undefined) ?? 10;
  const day = (farmer.beliefs.data["currentDay"] as number | undefined) ?? ctx.tick;
  const inVillage = farmer.farmer?.currentRegion === "village";

  farmer.intentions.queue.length = 0;

  // 1. Plant / buy seed based on profitability + weather.
  const choice = chooseTargetCrop(farmer, reserve);
  if (choice) {
    if (choice.mode === "plant") {
      farmer.intentions.queue.push({
        kind: "plant",
        data: { crop: choice.crop },
        priority: 1,
      });
    } else {
      farmer.intentions.queue.push({
        kind: "buy-seed",
        data: { crop: choice.crop, quantity: 1 },
        priority: 2,
      });
    }
  }

  // 2. Every 2 days, post inventory on market wall at priceMax.
  if (day % 2 === 0) {
    for (const crop of PROFITABILITY_ORDER) {
      const qty = farmer.inventory.crops[crop];
      if (qty > 0) {
        if (!inVillage) {
          farmer.intentions.queue.push({
            kind: "travel",
            data: { targetRegionId: "village" },
            priority: 3,
          });
        }
        farmer.intentions.queue.push({
          kind: "post-offer",
          data: {
            ontology: ONT_MARKET.POST_OFFER,
            crop,
            quantity: qty,
            pricePerUnit: PRICE_MAX[crop],
          },
          priority: 3,
        });
      }
    }

    // 3. Every 2 days, scan wall for undercut opportunities.
    farmer.intentions.queue.push({
      kind: "read-offers",
      data: { ontology: ONT_MARKET.READ_OFFERS },
      priority: 4,
    });

    // If we already have a perceived offer list in beliefs, react to it.
    const offers = farmer.beliefs.data["marketOffers"] as MarketOffer[] | undefined;
    if (offers) {
      for (const offer of offers) {
        if (offer.sellerId === farmer.id) continue;
        const threshold = SHOP_PRICE[offer.crop] * UNDERCUT_THRESHOLD;
        if (offer.pricePerUnit < threshold) {
          const cost = offer.pricePerUnit * offer.quantity;
          if (farmer.inventory.gold - cost >= reserve) {
            if (!inVillage) {
              farmer.intentions.queue.push({
                kind: "travel",
                data: { targetRegionId: "village" },
                priority: 5,
              });
            }
            farmer.intentions.queue.push({
              kind: "buy-from-wall",
              data: {
                offerId: offer.offerId,
                pricePerUnit: offer.pricePerUnit,
                quantity: offer.quantity,
              },
              priority: 5,
            });
          }
        }
      }
    }
  }

  // 4. Liquidate-last-2-days behavior is intentionally skipped — no end-of-sim signal yet.

  // 5. Background fallback: sell crops to shopkeeper if we somehow accumulated them and
  //    today is not a wall-posting day (to keep gold flowing).
  if (day % 2 !== 0) {
    for (const crop of PROFITABILITY_ORDER) {
      const qty = farmer.inventory.crops[crop];
      if (qty > 0) {
        if (!inVillage) {
          farmer.intentions.queue.push({
            kind: "travel",
            data: { targetRegionId: "village" },
            priority: 6,
          });
        }
        farmer.intentions.queue.push({
          kind: "sell-shopkeeper",
          data: { crop, quantity: qty },
          priority: 6,
        });
      }
    }
  }

  farmer.intentions.queue.sort((a, b) => a.priority - b.priority);
}

registerPersonality("aggressive", deliberateAggressive);

// ---------------------------------------------------------------------------
// Peer-trade hooks (encounter-trade system)
// ---------------------------------------------------------------------------

const AGGR_PEER_SHOP_SELL_PRICE: Record<CropKind, number> = {
  radish: 8,
  wheat: 14,
  pumpkin: 35,
};
const AGGR_PEER_BUY_CEILING = 0.95; // discount buyer
const AGGR_PEER_SELL_FLOOR = 1.0;   // sells at shopkeeper ceiling

export const respondToPeerOfferAggressive: RespondPeerOfferFn = (
  farmer,
  offer,
  _sender,
  _ctx,
) => {
  if (!farmer.inventory) return { decision: "decline", reason: "no-inventory" };
  const reserve =
    (farmer.desires?.data["minGoldReserve"] as number | undefined) ?? 10;
  const ref = AGGR_PEER_SHOP_SELL_PRICE[offer.crop];

  if (offer.direction === "sell") {
    if (offer.unitPrice > ref * AGGR_PEER_BUY_CEILING) {
      return { decision: "decline", reason: "price-too-high" };
    }
    const cost = offer.unitPrice * offer.quantity;
    if (farmer.inventory.gold - cost < reserve) {
      return { decision: "decline", reason: "would-breach-reserve" };
    }
    return { decision: "accept" };
  }

  // direction === "buy" — peer wants to buy from us.
  if (offer.unitPrice < ref * AGGR_PEER_SELL_FLOOR) {
    return { decision: "decline", reason: "price-too-low" };
  }
  if (farmer.inventory.seeds[offer.crop] < offer.quantity) {
    return { decision: "decline", reason: "no-stock" };
  }
  return { decision: "accept" };
};

registerPeerTradeHooks("aggressive", { respond: respondToPeerOfferAggressive });
