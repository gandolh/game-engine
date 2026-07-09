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
import type { PlotWaterSense } from "../systems/farming/plot-sense";
import type { TileFeature, FarmDecoration } from "../components";

const UNDERCUT_THRESHOLD = 0.9; 

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

  deliberateUpgrade(farmer, "axe", 6);
  deliberateUpgrade(farmer, "pickaxe", 7);
  deliberateUpgrade(farmer, "hoe", 8);
  deliberateResourceZoneVisit(farmer, features, "tree", 9);
  deliberateResourceZoneVisit(farmer, features, "stone", 10);
  deliberateFishing(farmer, 7, 2, 11);

  deliberateCoralFishing(farmer, 8, 3, -2, 50);

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

      farmer.intentions.queue.unshift({
        kind: "travel",
        data: { targetRegionId: "village" },
        priority: 0,
      });
      recordReason(farmer, `travel village: have crops to sell`);
    }

    deliberateBean(farmer, 0.95);
    deliberateSleep(farmer);

    farmer.intentions.queue.sort((a, b) => a.priority - b.priority);
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

  deliberateBean(farmer, 0.95);

  deliberatePeriodicMarketVisit(farmer, 3, 6);

  deliberateTendPens(farmer, 12);
  deliberateSellProducts(farmer, 12);
  deliberateHarvestFruit(farmer, 12);
  deliberateSellFruit(farmer, 12);

  deliberateHireHelp(farmer, reserve, 13, -2);

  if (day >= 3) {
    const openContracts = (farmer.beliefs?.data.harborOpenContracts as HarborContract[] | undefined) ?? [];
    const tol = (farmer.desires.data.riskTolerance as number | undefined) ?? 1.0;
    deliberateHarborContract(farmer, openContracts, tol, reserve, 4, -2);
  }

  deliberateTavernGather(farmer, -2);
  deliberateFestivalGather(farmer, -2);

  deliberateSleep(farmer);

  farmer.intentions.queue.sort((a, b) => a.priority - b.priority);
}

registerPersonality("aggressive", deliberateAggressive);

const AGGR_PEER_BUY_CEILING = 0.95; 
const AGGR_PEER_SELL_FLOOR = 1.0;   

export const respondToPeerOfferAggressive = makeRespondPeerOffer({
  buyCeiling: AGGR_PEER_BUY_CEILING,
  sellFloor: AGGR_PEER_SELL_FLOOR,
  bufferSeeds: 0,
  reserveDefault: 10,
});

export const initiatePeerTradeAggressive = makeInitiatePeerTrade({
  stance: "buy-shortage",
  crop: "radish",
  quantity: 2,
  threshold: 2,
  priceMult: 1.0,
  reserveDefault: 10,
});

export const respondCropOfferAggressive = makeRespondPeerOffer({
  commodity: "crop",
  buyCeiling: 0.95,
  sellFloor: 1.0,
  bufferSeeds: 0,
  reserveDefault: 10,
});

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
