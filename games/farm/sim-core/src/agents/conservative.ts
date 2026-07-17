import type { GameEntity, CropKind } from "../components";
import { recordReason, resetDecisionTrace } from "../components";
import { registerPersonality } from "./registry";
import {
  registerPeerTradeHooks,
} from "./peer-trade-registry";
import { makeRespondPeerOffer, makeInitiatePeerTrade } from "./peer-trade-policy";
import { deliberateBean } from "./bean-valuation";
import { nonFarmFocus, gatherBias, TEMPERAMENT } from "./skill-valuation";
import { deliberateWatering, deliberateRefillCan, deliberateTill, deliberateBuyTool, deliberateResourceGather, deliberateDecoration, deliberateUpgrade, deliberateResourceZoneVisit, deliberateEarlyVillageVisit, deliberateSleep, deliberatePeriodicMarketVisit, deliberatePlantNearby, deliberateBuildPen, deliberateBuyAnimal, deliberateTendPens, deliberateSellProducts, deliberatePlantOrchard, deliberateHarvestFruit, deliberateSellFruit, deliberateBuildGreenhouse, deliberateGreenhousePlant, deliberateTavernGather, deliberateFestivalGather, deliberateHarborContract, deliberateSkilledNonFarm } from "./watering";
import type { HarborContract } from "../protocols/harbor";
import type { PlotWaterSense } from "../systems/farming/plot-sense";
import type { TileFeature, FarmDecoration } from "../components";
import { SEED_COST, CROP_SEASON } from "../economy";
import { seasonForDay } from "../protocols/weather";

function pickConservativeCrop(
  day: number,
  gold: number,
  reserve: number,
  seeds?: Record<CropKind, number>,
): { crop: CropKind; cost: number } {
  const season = seasonForDay(day);
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
  for (const crop of inSeasonCheap) {
    const cost = SEED_COST[crop];
    if (gold - cost >= reserve) return { crop, cost };
  }

  return { crop: "radish", cost: SEED_COST.radish };
}

function pickGreenhouseCrop(day: number): CropKind {
  const season = seasonForDay(day);
  const byValue: CropKind[] = ["grape", "pumpkin", "corn", "tomato", "winter-squash", "wheat", "carrot", "radish"];
  for (const crop of byValue) {
    if (CROP_SEASON[crop] !== season) return crop;
  }
  return "grape";
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

  const sense = farmer.beliefs.data.plotWater as PlotWaterSense | undefined;
  const planWater = sense?.due ?? 0;
  deliberateRefillCan(farmer, planWater);

  deliberateWatering(farmer, { dryThreshold: 0 });

  const plotsOwned = (farmer.beliefs.data.plotWater as PlotWaterSense | undefined)?.planted ?? 0;
  if (plotsOwned < 6 && gold >= reserve + seedCost) {
    const occupied = new Set<string>(
      ((farmer.beliefs.data.occupiedTiles as string[] | undefined) ?? [])
    );
    deliberateBuyTool(farmer, "hoe", 1);
    deliberateTill(farmer, occupied, 1, 2);
  }

  const features = (farmer.beliefs.data.tileFeatures as TileFeature[] | undefined) ?? [];
  // Skill-gated non-farm lean (shared valuation): conservative sticks to farming
  // longest — only leans when a line's skilled marginal clearly beats farming.
  const focus = nonFarmFocus(farmer, TEMPERAMENT.conservative!);
  const gb = gatherBias(focus, 1, 8);
  deliberateResourceGather(farmer, features, gb.maxActions, gb.priority, gb.preferKind);

  const decorations = (farmer.beliefs.data.decorations as FarmDecoration[] | undefined) ?? [];
  deliberateDecoration(farmer, decorations, 9);

  deliberateEarlyVillageVisit(farmer, 10);

  deliberateUpgrade(farmer, "hoe", 11);
  deliberateUpgrade(farmer, "axe", 12);
  deliberateResourceZoneVisit(farmer, features, "tree", 13);

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

  deliberateBean(farmer, 0.45);

  deliberatePeriodicMarketVisit(farmer, 3, 6);

  const surplusGold = gold >= reserve + 50;
  const plotsUrgent = (sense?.maxDrySoFar ?? 0) >= 2; 
  const apHeadroom = (farmer.ap?.current ?? 0) >= 20;
  const quietInvestDay = surplusGold && !plotsUrgent && apHeadroom;

  const hasCoop = (farmer.beliefs.data["hasPen_coop"] as boolean | undefined) ?? false;
  const chickens = (farmer.beliefs.data["penCount_chicken"] as number | undefined) ?? 0;
  const orchardCount = (farmer.beliefs.data["orchardCount"] as number | undefined) ?? 0;

  if (day >= 6) {
    const orchardCommit = quietInvestDay && orchardCount < 1;
    deliberatePlantOrchard(farmer, "apple", 2, reserve + 5, 16, orchardCommit ? -2 : undefined);
    deliberateHarvestFruit(farmer, 3);
    deliberateSellFruit(farmer, 5);
  }

  const hasGreenhouse = (farmer.beliefs.data["hasGreenhouse"] as boolean | undefined) ?? false;
  const greenhouseSurplus = gold >= reserve + 90;
  const greenhouseQuietDay = greenhouseSurplus && !plotsUrgent && apHeadroom;
  let committedGreenhouseExcursion = false;
  if (day >= 6 && !hasGreenhouse && greenhouseQuietDay) {
    deliberateBuildGreenhouse(farmer, reserve, 13, -2);
    committedGreenhouseExcursion = true;
  }
  if (hasGreenhouse) {
    const ghCrop = pickGreenhouseCrop(day);
    deliberateGreenhousePlant(farmer, ghCrop, SEED_COST[ghCrop], reserve, 2);
  }

  if (day >= 8) {
    deliberateTendPens(farmer, 4);
    deliberateSellProducts(farmer, 5);
  }
  if (day >= 8 && quietInvestDay && orchardCount >= 1 && !committedGreenhouseExcursion) {
    if (!hasCoop) {
      deliberateBuildPen(farmer, "coop", "chicken", reserve + 5, 14, -2);
    }
    if (hasCoop && chickens < 3) {
      deliberateBuyAnimal(farmer, "chicken", reserve + 5, 15, -2);
    }
  }

  const openContracts = (farmer.beliefs?.data.harborOpenContracts as HarborContract[] | undefined) ?? [];
  if (day >= 3) {
    const baked = (farmer.desires.data.riskTolerance as number | undefined) ?? 0.0;
    const harborTolerance = day >= 10 ? Math.max(0.5, baked) : baked;
    deliberateHarborContract(farmer, openContracts, harborTolerance, reserve, 5, -2);
  }

  deliberateSkilledNonFarm(farmer, focus, features, 6);

  deliberateTavernGather(farmer, -2);
  deliberateFestivalGather(farmer, -2);
  deliberateSleep(farmer);
  farmer.intentions.queue.sort((a, b) => a.priority - b.priority);
}

registerPersonality("conservative", deliberateConservative);

const CONS_PEER_BUY_CEILING = 1.0; 
const CONS_PEER_SELL_FLOOR = 0.9;
const CONS_BUFFER_SEEDS = 1;

export const respondToPeerOfferConservative = makeRespondPeerOffer({
  buyCeiling: CONS_PEER_BUY_CEILING,
  sellFloor: CONS_PEER_SELL_FLOOR,
  bufferSeeds: CONS_BUFFER_SEEDS,
  reserveDefault: 30,
});

export const respondCropOfferConservative = makeRespondPeerOffer({
  commodity: "crop",
  buyCeiling: 0.9, 
  sellFloor: 0.9,
  bufferSeeds: 0,
  reserveDefault: 30,
});

registerPeerTradeHooks("conservative", {
  respond: respondToPeerOfferConservative,
  respondCrop: respondCropOfferConservative,
});
