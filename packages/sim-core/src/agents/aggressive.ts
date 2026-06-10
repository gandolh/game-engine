import type { GameEntity, CropKind } from "../components";
import { recordReason, resetDecisionTrace } from "../components";
import { registerPersonality, type DeliberateContext } from "./registry";
import { ONT_MARKET, type MarketOffer } from "../protocols/market";
import {
  registerPeerTradeHooks,
  type InitiateBeanGiftFn,
} from "./peer-trade-registry";
import { makeRespondPeerOffer, makeInitiatePeerTrade } from "./peer-trade-policy";
import { CROP_SELL_PRICE, SEED_COST, CROP_SEASON } from "../economy";
import { seasonForDay } from "../protocols/weather";
import { deliberateBean } from "./bean-valuation";
import { deliberateWatering, deliberateRefillCan, deliberateTill, deliberateBuyTool, deliberateResourceGather, deliberateUpgrade, deliberateResourceZoneVisit, deliberateEarlyVillageVisit, deliberateSleep, deliberatePeriodicMarketVisit, deliberateMillVisit, deliberateFishing, deliberateCoralFishing, deliberatePlantNearby, deliberateTendPens, deliberateSellProducts, deliberateHarvestFruit, deliberateSellFruit, deliberateCommissionBuild, deliberateHireHelp, deliberateTavernGather, deliberateFestivalGather, deliberateHarborContract } from "./watering";
import type { HarborContract } from "../protocols/harbor";
import type { PlotWaterSense } from "../systems/plot-sense";
import type { TileFeature, FarmDecoration } from "../components";

const UNDERCUT_THRESHOLD = 0.9; // buy offers below 90% of shop price

/** Picks highest-value in-season crop; downgrades to cheapest in-season under storm/rain. */
function chooseTargetCrop(
  farmer: GameEntity,
  reserve: number,
  day: number,
): { crop: CropKind; mode: "plant" | "buy-seed" } | null {
  if (!farmer.inventory) return null;
  const gold = farmer.inventory.gold;
  const weather = (farmer.beliefs?.data["weather"] as { current?: string } | undefined)?.current;
  const season = seasonForDay(day);

  const allCrops: CropKind[] = ["grape", "corn", "pumpkin", "tomato", "winter-squash", "wheat", "carrot", "radish"];
  const isBadWeather = weather === "storm" || weather === "rainy";
  // reverse() = cheapest-first under bad weather; natural order = most profitable first
  const order: CropKind[] = isBadWeather
    ? allCrops.filter(c => CROP_SEASON[c] === season).reverse()
    : allCrops.filter(c => CROP_SEASON[c] === season);

  const candidates = order.length > 0 ? order : allCrops;

  for (const crop of candidates) {
    if (farmer.inventory.seeds[crop] >= 1) {
      return { crop, mode: "plant" };
    }
  }
  for (const crop of candidates) {
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
  const daysRemaining = farmer.beliefs.data["daysRemaining"] as number | undefined;
  const inVillage = farmer.farmer?.currentRegion === "village";

  farmer.intentions.queue.length = 0;
  resetDecisionTrace(farmer);

  const sense = farmer.beliefs.data.plotWater as PlotWaterSense | undefined;
  // Watery lazily (threshold 1): may let a marginal plot die rather than tend every one.
  const planWater = Math.min(sense?.due ?? 0, 3);
  deliberateRefillCan(farmer, planWater);
  deliberateWatering(farmer, { dryThreshold: 1, maxWaterPerDay: 3 });

  const plotsOwned = sense?.planted ?? 0;
  if (plotsOwned < 9) {
    const occupied = new Set<string>((farmer.beliefs.data.occupiedTiles as string[] | undefined) ?? []);
    deliberateBuyTool(farmer, "hoe", 2);
    deliberateTill(farmer, occupied, 3, 3);
  }
  const features = (farmer.beliefs.data.tileFeatures as TileFeature[] | undefined) ?? [];
  deliberateResourceGather(farmer, features, 2, 7);

  const decorations = (farmer.beliefs.data.decorations as FarmDecoration[] | undefined) ?? [];
  const plotsUrgentAggr = (sense?.maxDrySoFar ?? 0) >= 2;
  const apHeadroomAggr = (farmer.ap?.current ?? 0) >= 20;
  const quietInvestDayAggr = !plotsUrgentAggr && apHeadroomAggr;
  deliberateCommissionBuild(farmer, decorations, 6, quietInvestDayAggr ? -2 : undefined);

  deliberateMillVisit(farmer, 10, 6);

  deliberateEarlyVillageVisit(farmer, 5);
  // Upgrade axe first (aggressive chops heavily for wood/decorations).
  deliberateUpgrade(farmer, "axe", 6);
  deliberateUpgrade(farmer, "pickaxe", 7);
  deliberateUpgrade(farmer, "hoe", 8);
  deliberateResourceZoneVisit(farmer, features.length, "tree", 9);
  deliberateResourceZoneVisit(farmer, features.length, "stone", 10);
  deliberateFishing(farmer, 7, 2, 11);
  // Coral: bigger AP floor and fewer trips than opportunist (a bet, not routine).
  deliberateCoralFishing(farmer, 8, 3, -2, 50);

  // Last 2 days: liquidate everything to the shopkeeper.
  if (daysRemaining !== undefined && daysRemaining <= 2) {
    let anyToSell = false;
    for (const crop of Object.keys(farmer.inventory.crops) as CropKind[]) {
      const qty = farmer.inventory.crops[crop];
      if (qty > 0) {
        anyToSell = true;
        farmer.intentions.queue.push({
          kind: "sell-shopkeeper",
          data: { crop, quantity: qty },
          priority: 0,
        });
        recordReason(farmer, `sell ${crop} x${qty}: liquidate (${daysRemaining}d left)`);
      }
    }
    if (anyToSell && !inVillage) {
      // Unshift so this travel lands before all priority-0 sell intents.
      farmer.intentions.queue.unshift({
        kind: "travel",
        data: { targetRegionId: "village" },
        priority: 0,
      });
      recordReason(farmer, `travel village: have crops to sell`);
    }
    return;
  }

  const choice = chooseTargetCrop(farmer, reserve, day);
  if (choice) {
    const cropSeason = CROP_SEASON[choice.crop];
    const currentSeason = seasonForDay(day);
    const seasonNote = currentSeason === cropSeason ? "in-season premium" : "best available";
    if (choice.mode === "plant") {
      if (deliberatePlantNearby(farmer, choice.crop, 1)) {
        recordReason(farmer, `plant ${choice.crop}: ${seasonNote}`);
      }
    } else {
      farmer.intentions.queue.push({
        kind: "buy-seed",
        data: { crop: choice.crop, quantity: 1 },
        priority: 2,
      });
      recordReason(farmer, `buy seed ${choice.crop}: ${seasonNote}`);
    }
  }

  // Post inventory on market wall every 2 days.
  if (day % 2 === 0) {
    for (const crop of Object.keys(farmer.inventory.crops) as CropKind[]) {
      const qty = farmer.inventory.crops[crop];
      if (qty > 0) {
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
            pricePerUnit: CROP_SELL_PRICE[crop],
          },
          priority: 3,
        });
        recordReason(farmer, `post offer ${crop} x${qty} @ ${CROP_SELL_PRICE[crop]}`);
      }
    }

    farmer.intentions.queue.push({
      kind: "read-offers",
      data: { ontology: ONT_MARKET.READ_OFFERS },
      priority: 4,
    });
    recordReason(farmer, `read offers: scan for undercuts`);

    const offers = farmer.beliefs.data["marketOffers"] as MarketOffer[] | undefined;
    if (offers) {
      for (const offer of offers) {
        if (offer.sellerId === farmer.id) continue;
        const threshold = CROP_SELL_PRICE[offer.crop] * UNDERCUT_THRESHOLD;
        if (offer.pricePerUnit < threshold) {
          const cost = offer.pricePerUnit * offer.quantity;
          if (farmer.inventory.gold - cost >= reserve) {
            if (!inVillage) {
              farmer.intentions.queue.push({
                kind: "travel",
                data: { targetRegionId: "village" },
                priority: 5,
              });
              recordReason(farmer, `travel village: buy undercut`);
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
            recordReason(farmer, `buy wall ${offer.crop} x${offer.quantity}: ${offer.pricePerUnit} < ${Math.round(threshold)}`);
          }
        }
      }
    }
  }

  // On odd days, sell crops directly to keep gold flowing.
  if (day % 2 !== 0) {
    for (const crop of Object.keys(farmer.inventory.crops) as CropKind[]) {
      const qty = farmer.inventory.crops[crop];
      if (qty > 0) {
        if (!inVillage) {
          farmer.intentions.queue.push({
            kind: "travel",
            data: { targetRegionId: "village" },
            priority: 6,
          });
          recordReason(farmer, `travel village: have crops to sell`);
        }
        farmer.intentions.queue.push({
          kind: "sell-shopkeeper",
          data: { crop, quantity: qty },
          priority: 6,
        });
        recordReason(farmer, `sell ${crop} x${qty}`);
      }
    }
  }

  // Bids near full expected resale (0.95) and flips beans.
  deliberateBean(farmer, 0.95);

  deliberatePeriodicMarketVisit(farmer, 3, 6);

  // Skips livestock build; only tends if already has pens.
  deliberateTendPens(farmer, 12);
  deliberateSellProducts(farmer, 12);
  deliberateHarvestFruit(farmer, 12);
  deliberateSellFruit(farmer, 12);

  deliberateHireHelp(farmer, reserve, 13, -2);

  // riskTolerance 1.0 = speculative: commits even without goods in hand.
  if (day >= 3) {
    const openContracts = (farmer.beliefs?.data.harborOpenContracts as HarborContract[] | undefined) ?? [];
    deliberateHarborContract(farmer, openContracts, 1.0, reserve, 4, -2);
  }

  deliberateTavernGather(farmer, -2);
  deliberateFestivalGather(farmer, -2);

  deliberateSleep(farmer);

  farmer.intentions.queue.sort((a, b) => a.priority - b.priority);
}

registerPersonality("aggressive", deliberateAggressive);

const AGGR_PEER_BUY_CEILING = 0.95; // discount buyer
const AGGR_PEER_SELL_FLOOR = 1.0;   // sells at shopkeeper ceiling

export const respondToPeerOfferAggressive = makeRespondPeerOffer({
  buyCeiling: AGGR_PEER_BUY_CEILING,
  sellFloor: AGGR_PEER_SELL_FLOOR,
  bufferSeeds: 0,
  reserveDefault: 10,
});

// Buys radish seeds peer-to-peer when short (growth over reserve); seeds rarely surplus so seldom closes.
export const initiatePeerTradeAggressive = makeInitiatePeerTrade({
  stance: "buy-shortage",
  crop: "radish",
  quantity: 2,
  threshold: 2,
  priceMult: 1.0,
  reserveDefault: 10,
});

// Snaps up surplus harvested crops at discount (ceiling 0.95) to resell at the wall.
export const respondCropOfferAggressive = makeRespondPeerOffer({
  commodity: "crop",
  buyCeiling: 0.95,
  sellFloor: 1.0,
  bufferSeeds: 0,
  reserveDefault: 10,
});

// Gifts bean to most-trusted peer (>= 0.6) to cement the alliance rather than flip for gold.
export const initiateBeanGiftAggressive: InitiateBeanGiftFn = (
  farmer,
  meet,
  _ctx,
) => {
  const trust = farmer.trust?.byId.get(meet.peerId) ?? 0.5;
  if (trust < 0.6) return null;
  return { offerId: `bean-${farmer.id}-${meet.peerId}`, quantity: 1 };
};

registerPeerTradeHooks("aggressive", {
  initiate: initiatePeerTradeAggressive,
  respond: respondToPeerOfferAggressive,
  initiateGift: initiateBeanGiftAggressive,
  respondCrop: respondCropOfferAggressive,
});
