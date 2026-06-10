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
import { makeRespondPeerOffer, makeInitiatePeerTrade } from "./peer-trade-policy";
import { CROP_SELL_PRICE, SEED_COST, CROP_SEASON } from "../economy";
import { seasonForDay } from "../protocols/weather";
import { deliberateBean } from "./bean-valuation";
import { deliberateWatering, deliberateRefillCan, deliberateTill, deliberateBuyTool, deliberateResourceGather, deliberateDecoration, deliberateUpgrade, deliberateResourceZoneVisit, deliberateEarlyVillageVisit, deliberateSleep, deliberatePeriodicMarketVisit, deliberateSeasonalForage, deliberatePlantNearby, deliberateBuildPen, deliberateBuyAnimal, deliberateTendPens, deliberateSellProducts, deliberatePlantOrchard, deliberateHarvestFruit, deliberateSellFruit, deliberateBuildGreenhouse, deliberateHireHelp, deliberateTavernGather, deliberateFestivalGather, deliberateHarborContract, deliberateCoralFishing } from "./watering";
import type { PlotWaterSense } from "../systems/plot-sense";
import type { TileFeature, FarmDecoration } from "../components";
import type { HarborContract } from "../protocols/harbor";

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

  // brief 42 — hoarder strongly leans into livestock + orchards (patient capital),
  // using the same committed-excursion discipline as the conservative (see the
  // long note there): a far trip only lands when given a winning travel priority
  // on a quiet day, so we commit ONE excursion at a time. The hoarder is the
  // POOREST farmer live, so these fire only when she's genuinely flush — exactly
  // the intended "patient capital when affordable, skip when broke" behaviour.
  const surplusGold = farmer.inventory.gold >= reserve + 50;
  const plotsUrgent = (sense?.maxDrySoFar ?? 0) >= 2;
  const apHeadroom = (farmer.ap?.current ?? 0) >= 20;
  const quietInvestDay = surplusGold && !plotsUrgent && apHeadroom;
  const hasCoop = (farmer.beliefs.data["hasPen_coop"] as boolean | undefined) ?? false;
  const chickens = (farmer.beliefs.data["penCount_chicken"] as number | undefined) ?? 0;
  const orchardCount = (farmer.beliefs.data["orchardCount"] as number | undefined) ?? 0;

  // Orchard first (on-farm, slow-maturing) — apple for autumn fruit.
  if (day >= 6) {
    const orchardCommit = quietInvestDay && orchardCount < 1;
    deliberatePlantOrchard(farmer, "apple", 2, reserve + 5, 18, orchardCommit ? -2 : undefined);
    deliberateHarvestFruit(farmer, 3);
    deliberateSellFruit(farmer, 5);
  }
  // Livestock loop (build coop + stock at the carpenter in one trip).
  if (day >= 8) {
    deliberateTendPens(farmer, 4);
    deliberateSellProducts(farmer, 5);
    if (quietInvestDay && orchardCount >= 1) {
      if (!hasCoop) deliberateBuildPen(farmer, "coop", "chicken", reserve + 5, 14, -2);
      if (hasCoop && chickens < 3) deliberateBuyAnimal(farmer, "chicken", reserve + 5, 15, -2);
    }
  }

  // brief 43 — greenhouse (the heaviest sink). Hoarder is patient capital, so she
  // builds it when genuinely flush, on its own quiet day with a large cushion.
  const hasGreenhouse = (farmer.beliefs.data["hasGreenhouse"] as boolean | undefined) ?? false;
  const greenhouseQuietDay = farmer.inventory.gold >= reserve + 220 && !plotsUrgent && apHeadroom;
  if (day >= 12 && !hasGreenhouse && greenhouseQuietDay) {
    deliberateBuildGreenhouse(farmer, reserve, 13, -2);
  }

  // brief 44 — hoarder is the trailing farmer live; the day-helper is exactly the
  // catch-up sink it needs when AP-starved but holding a gold cushion.
  deliberateHireHelp(farmer, reserve, 13, -2);

  // brief 46 — harbor contracts. Hoarder stockpiles goods and targets PREMIUM
  // (silver/gold) contracts: moderate risk (will commit if goods are in hand OR
  // can be grown in time). Hoarder is patient — commits from day 5 onward, never
  // overcommits.
  if (day >= 5) {
    const openContracts = (farmer.beliefs?.data.harborOpenContracts as HarborContract[] | undefined) ?? [];
    deliberateHarborContract(farmer, openContracts, 0.5, reserve, 5, -2);
  }

  // brief 48 — the hoarder stockpiles, so it values the high-value coral catch
  // but only on a comfortably-free day (steep AP floor) — it won't risk its
  // hoarding routine. Infrequent, cautious trips.
  deliberateCoralFishing(farmer, 12, 2, -2, 80);

  // brief 44 — gathering beat (pure flavor; an idle in-village farmer drifts to
  // the tavern). Runs before the sleep helper so it can claim a truly-idle queue.
  deliberateTavernGather(farmer, -2);
  // brief 45 — festival-day gathering at the village podium.
  deliberateFestivalGather(farmer, -2);
  deliberateSleep(farmer);
  farmer.intentions.queue.sort((a, b) => a.priority - b.priority);
}

registerPersonality("hoarder", deliberateHoarder);

// ---------------------------------------------------------------------------
// Peer-trade hooks (encounter-trade system)
// ---------------------------------------------------------------------------

const HOARDER_INITIATE_QTY = 3;
/**
 * Hoarder bids at the seed's shop cost (a fair price a peer holding surplus
 * will take — it beats nothing, and is below the hoarder's own 1.05 buy
 * ceiling). Priced against SEED_COST, not the harvested-crop value. (Pre-brief-59
 * this was a flat 4.5 vs an 8-anchored floor, so every offer was declined.)
 */
const HOARDER_INITIATE_PRICE_MULT = 1.0;
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
  const unitPrice = SEED_COST[crop] * HOARDER_INITIATE_PRICE_MULT;

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

/**
 * brief 59 — the hoarder is the field's big crop accumulator (it stockpiles
 * harvested crops and sells them inefficiently — peak wheat ~22 vs ~4 for
 * anyone else), so it's the natural SUPPLY side of the peer crop economy.
 * Giving it a peer-sell outlet for surplus (threshold 6, above its working
 * stock; small 2-unit parcels so a cash-tight buyer can afford one) is in
 * character — it only parts with crops once it has a comfortable pile. Sells
 * just below shop (0.95) so the opportunist/aggressive buyers bite. This is
 * what lets crop trades actually close and feed the trust matrix.
 */
export const initiateCropTradeHoarder = makeInitiatePeerTrade({
  stance: "sell-surplus",
  commodity: "crop",
  crop: "wheat",
  quantity: 2,
  threshold: 6,
  priceMult: 0.95,
  reserveDefault: 80,
});

registerPeerTradeHooks("hoarder", {
  initiate: initiatePeerTradeHoarder,
  respond: respondToPeerOfferHoarder,
  initiateCrop: initiateCropTradeHoarder,
});
