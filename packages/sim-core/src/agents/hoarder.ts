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

const BUY_PRICE_MULTIPLIER = 1.05; 

function pickHoarderCrop(day: number, gold: number, reserve: number): CropKind {
  const season = seasonForDay(day);
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

  const sense = farmer.beliefs.data.plotWater as PlotWaterSense | undefined;
  deliberateRefillCan(farmer, sense?.due ?? 0);

  deliberateWatering(farmer, { dryThreshold: 0 });

  const plotsOwned = sense?.planted ?? 0;
  if (plotsOwned < 7) {
    const occupied = new Set<string>((farmer.beliefs.data.occupiedTiles as string[] | undefined) ?? []);
    deliberateBuyTool(farmer, "hoe", 2);
    deliberateTill(farmer, occupied, 1, 3);
  }
  const features = (farmer.beliefs.data.tileFeatures as TileFeature[] | undefined) ?? [];
  deliberateResourceGather(farmer, features, 1, 9);

  const decorations = (farmer.beliefs.data.decorations as FarmDecoration[] | undefined) ?? [];
  deliberateDecoration(farmer, decorations, 7);

  deliberateSeasonalForage(farmer, 8);

  deliberateEarlyVillageVisit(farmer, 8);

  deliberateUpgrade(farmer, "hoe",     9);
  deliberateUpgrade(farmer, "axe",     10);
  deliberateUpgrade(farmer, "pickaxe", 11);
  deliberateResourceZoneVisit(farmer, features.length, "tree",  12);
  deliberateResourceZoneVisit(farmer, features.length, "stone", 13);

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

  farmer.intentions.queue.push({
    kind: "read-offers",
    data: { ontology: ONT_MARKET.READ_OFFERS, filter: { crop: "radish" } },
    priority: 5,
  });
  recordReason(farmer, `read offers: scan radish wall`);

  const offers = (farmer.beliefs.data["marketOffers"] as MarketOffer[] | undefined) ?? [];
  const trust = farmer.trust?.byId;

  const ranked = offers
    .filter((o) => o.sellerId !== farmer.id)
    .filter((o) => o.pricePerUnit <= CROP_SELL_PRICE[o.crop] * BUY_PRICE_MULTIPLIER)
    .map((o) => ({ o, t: trust?.get(o.sellerId) ?? 0.5 }))
    .sort((a, b) => {
      if (b.t !== a.t) return b.t - a.t;

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

  deliberateBean(farmer, 0.9, { resell: false });

  deliberatePeriodicMarketVisit(farmer, 3, 6);

  const surplusGold = farmer.inventory.gold >= reserve + 50;
  const plotsUrgent = (sense?.maxDrySoFar ?? 0) >= 2;
  const apHeadroom = (farmer.ap?.current ?? 0) >= 20;
  const quietInvestDay = surplusGold && !plotsUrgent && apHeadroom;
  const hasCoop = (farmer.beliefs.data["hasPen_coop"] as boolean | undefined) ?? false;
  const chickens = (farmer.beliefs.data["penCount_chicken"] as number | undefined) ?? 0;
  const orchardCount = (farmer.beliefs.data["orchardCount"] as number | undefined) ?? 0;

  if (day >= 6) {
    const orchardCommit = quietInvestDay && orchardCount < 1;
    deliberatePlantOrchard(farmer, "apple", 2, reserve + 5, 18, orchardCommit ? -2 : undefined);
    deliberateHarvestFruit(farmer, 3);
    deliberateSellFruit(farmer, 5);
  }
  if (day >= 8) {
    deliberateTendPens(farmer, 4);
    deliberateSellProducts(farmer, 5);
    if (quietInvestDay && orchardCount >= 1) {
      if (!hasCoop) deliberateBuildPen(farmer, "coop", "chicken", reserve + 5, 14, -2);
      if (hasCoop && chickens < 3) deliberateBuyAnimal(farmer, "chicken", reserve + 5, 15, -2);
    }
  }

  const hasGreenhouse = (farmer.beliefs.data["hasGreenhouse"] as boolean | undefined) ?? false;
  const greenhouseQuietDay = farmer.inventory.gold >= reserve + 220 && !plotsUrgent && apHeadroom;
  if (day >= 12 && !hasGreenhouse && greenhouseQuietDay) {
    deliberateBuildGreenhouse(farmer, reserve, 13, -2);
  }

  deliberateHireHelp(farmer, reserve, 13, -2);

  if (day >= 5) {
    const openContracts = (farmer.beliefs?.data.harborOpenContracts as HarborContract[] | undefined) ?? [];
    const tol = (farmer.desires.data.riskTolerance as number | undefined) ?? 0.5;
    deliberateHarborContract(farmer, openContracts, tol, reserve, 5, -2);
  }

  deliberateCoralFishing(farmer, 12, 2, -2, 80);

  deliberateTavernGather(farmer, -2);
  deliberateFestivalGather(farmer, -2);
  deliberateSleep(farmer);
  farmer.intentions.queue.sort((a, b) => a.priority - b.priority);
}

registerPersonality("hoarder", deliberateHoarder);

const HOARDER_INITIATE_QTY = 3;

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

  if (farmer.inventory.seeds[crop] >= qty) return null;
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
