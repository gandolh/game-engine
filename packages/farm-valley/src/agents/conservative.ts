import type { GameEntity, CropKind } from "../components";
import { recordReason, resetDecisionTrace } from "../components";
import { registerPersonality } from "./registry";
import {
  registerPeerTradeHooks,
} from "./peer-trade-registry";
import { makeRespondPeerOffer } from "./peer-trade-policy";
import { deliberateBean } from "./bean-valuation";
import { deliberateWatering, deliberateRefillCan, deliberateTill, deliberateBuyTool, deliberateResourceGather, deliberateDecoration, deliberateUpgrade, deliberateResourceZoneVisit, deliberateEarlyVillageVisit, deliberateSleep, deliberatePeriodicMarketVisit, deliberatePlantNearby, deliberateBuildPen, deliberateBuyAnimal, deliberateTendPens, deliberateSellProducts, deliberatePlantOrchard, deliberateHarvestFruit, deliberateSellFruit, deliberateBuildGreenhouse, deliberateGreenhousePlant, deliberateTavernGather, deliberateFestivalGather, deliberateHarborContract } from "./watering";
import type { HarborContract } from "../protocols/harbor";
import type { PlotWaterSense } from "../systems/plot-sense";
import type { TileFeature, FarmDecoration } from "../components";
import { SEED_COST, CROP_SEASON } from "../economy";
import { seasonForDay } from "../protocols/weather";

/**
 * brief 41 — pick the safest (cheapest, in-season) crop for the current day.
 * If seeds on hand include an in-season crop, plant it first (never wasteful).
 * Otherwise buy the cheapest in-season crop we can afford.
 * Conservative prefers: spring→carrot/radish, summer→tomato, autumn→pumpkin,
 * winter→winter-squash. Fallback to radish if nothing else affordable.
 */
function pickConservativeCrop(
  day: number,
  gold: number,
  reserve: number,
  seeds?: Record<CropKind, number>,
): { crop: CropKind; cost: number } {
  const season = seasonForDay(day);
  // Priority: use seeds already on hand (in-season first, cheapest).
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
  // No in-season seeds on hand — buy the cheapest in-season we can afford.
  for (const crop of inSeasonCheap) {
    const cost = SEED_COST[crop];
    if (gold - cost >= reserve) return { crop, cost };
  }
  // Fallback: radish is always affordable.
  return { crop: "radish", cost: SEED_COST.radish };
}

/**
 * brief 43 — pick the crop to grow under glass: the highest-value crop whose
 * native season is NOT the current one, so the greenhouse earns what the open
 * field can't this season (its whole strategic point). Falls back to grape.
 */
function pickGreenhouseCrop(day: number): CropKind {
  const season = seasonForDay(day);
  // Value order (priciest first).
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

  // Refill watering can if needed before watering.
  const sense = farmer.beliefs.data.plotWater as PlotWaterSense | undefined;
  const planWater = sense?.due ?? 0;
  deliberateRefillCan(farmer, planWater);

  // brief 29 — conservative waters early, never risking the grace window.
  deliberateWatering(farmer, { dryThreshold: 0 });

  // Till up to 2 new plots if we have seeds and a hoe (conservative expands slowly).
  const plotsOwned = (farmer.beliefs.data.plotWater as PlotWaterSense | undefined)?.planted ?? 0;
  if (plotsOwned < 6 && gold >= reserve + seedCost) {
    const occupied = new Set<string>(
      ((farmer.beliefs.data.occupiedTiles as string[] | undefined) ?? [])
    );
    deliberateBuyTool(farmer, "hoe", 1);
    deliberateTill(farmer, occupied, 1, 2);
  }

  // Chop/mine on own farm (low priority — opportunistic).
  const features = (farmer.beliefs.data.tileFeatures as TileFeature[] | undefined) ?? [];
  deliberateResourceGather(farmer, features, 1, 8);

  // Craft decorations when we have wood (conservative: low priority, affordable ones).
  const decorations = (farmer.beliefs.data.decorations as FarmDecoration[] | undefined) ?? [];
  deliberateDecoration(farmer, decorations, 9);

  // Visit village day 0-1 to scout market (gets everyone walking early).
  deliberateEarlyVillageVisit(farmer, 10);
  // Upgrade hoe first (conservative farms a lot), then axe for wood.
  deliberateUpgrade(farmer, "hoe", 11);
  deliberateUpgrade(farmer, "axe", 12);
  // Visit resource zones when own farm has nothing left to gather.
  deliberateResourceZoneVisit(farmer, features.length, "tree", 13);

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
  // brief 41 — sell all crop kinds (dynamic, not hard-coded to 3).
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

  // brief 24 — bid cautiously (near reserve) and flip any beans held.
  deliberateBean(farmer, 0.45);

  deliberatePeriodicMarketVisit(farmer, 3, 6);

  // brief 42 — livestock + orchard (patient capital; conservative leans in hardest).
  //
  // These are LOW-priority by importance number, but the build/buy/plant ACTIONS
  // only execute once the farmer stands at the right place (carpentry / village /
  // a free farm tile), and those TRIPS compete with survival watering + selling.
  // A non-committal `+1` travel always loses, so the feature stayed dormant.
  //
  // Fix — give the trips a winning travel priority on a QUIET day (gold surplus +
  // plots not about to wilt + AP headroom), so they actually land without
  // permanently hijacking the farm loop. Crucially the two capital tracks are
  // INDEPENDENT, because they live in different places at this scale:
  //
  //   • ORCHARD is on the farmer's OWN farm (a short hop) and the tree needs
  //     ~20 days to mature, so plant it EARLY and on its own — it must not wait
  //     behind the slow cross-map livestock chain or it will never fruit in time.
  //   • LIVESTOCK needs a far carpentry trip (build) then a village trip (stock).
  //     At low ticks/day these trips take several in-game days of walking, so we
  //     commit ONE livestock excursion at a time (build → stock) and let the
  //     cheap tend/sell follow-ups ride normal days.
  //
  // The orchard commit and the livestock commit are kept on separate quiet days
  // (orchard takes precedence once it's plantable) so they don't fight over the
  // single queue[0] travel slot.
  const surplusGold = gold >= reserve + 50; // comfortable cushion before sinking capital
  // Plots one day from wilting (grace is 2 dry days) — never abandon those.
  const plotsUrgent = (sense?.maxDrySoFar ?? 0) >= 2;
  const apHeadroom = (farmer.ap?.current ?? 0) >= 20; // don't starve core work
  // A committed excursion may leave plots dry for ONE day; that's safe under the
  // 2-day grace window, and watering reclaims priority the moment she's home. We
  // only block the commit when a plot is actually about to die (plotsUrgent).
  const quietInvestDay = surplusGold && !plotsUrgent && apHeadroom;

  const hasCoop = (farmer.beliefs.data["hasPen_coop"] as boolean | undefined) ?? false;
  const chickens = (farmer.beliefs.data["penCount_chicken"] as number | undefined) ?? 0;
  const orchardCount = (farmer.beliefs.data["orchardCount"] as number | undefined) ?? 0;

  // ── ORCHARD track (plant early; on-farm; slow-maturing) ──────────────────────
  // Plant the first apple tree as soon as there's a quiet day from day 6, so the
  // ~20-day maturation completes with margin before autumn fruiting. Harvest +
  // sell ride normal days.
  if (day >= 6) {
    const orchardCommit = quietInvestDay && orchardCount < 1; // commit the very first tree
    deliberatePlantOrchard(farmer, "apple", 2, reserve + 5, 16, orchardCommit ? -2 : undefined);
    deliberateHarvestFruit(farmer, 3);
    deliberateSellFruit(farmer, 5);
  }

  // ── GREENHOUSE track (brief 43) — the run's heaviest sink, season-immune plots ─
  // Conservative is the patient-capital archetype, so she leans into the
  // greenhouse hardest and PRIORITISES it: it's the headline late-game milestone,
  // it pays back over the rest of the run, and it must be built early enough to
  // amortise. So once she can afford it she COMMITS the greenhouse excursion
  // FIRST (before the livestock excursion) and that excursion OWNS the single
  // carpentry-travel slot for the day — committing two far excursions on the same
  // quiet day would just stall both (only one resolves per arrival at this pace).
  // Once built she plants a premium crop (grape) in it YEAR-ROUND — the
  // season-immune plots grow it at full rate regardless of season, the payoff.
  const hasGreenhouse = (farmer.beliefs.data["hasGreenhouse"] as boolean | undefined) ?? false;
  const greenhouseSurplus = gold >= reserve + 90; // cushion over the material-discounted (~120g) sink
  const greenhouseQuietDay = greenhouseSurplus && !plotsUrgent && apHeadroom;
  let committedGreenhouseExcursion = false;
  if (day >= 6 && !hasGreenhouse && greenhouseQuietDay) {
    deliberateBuildGreenhouse(farmer, reserve, 13, -2);
    committedGreenhouseExcursion = true;
  }
  if (hasGreenhouse) {
    // Greenhouse strategy: grow a PREMIUM crop that is OUT of season outside, so
    // the season-immune plots earn what the open field can't right now. Pick the
    // priciest crop whose native season isn't the current one (grape unless it's
    // autumn, in which case the next-best off-season pick).
    const ghCrop = pickGreenhouseCrop(day);
    deliberateGreenhousePlant(farmer, ghCrop, SEED_COST[ghCrop], reserve, 2);
  }

  // ── LIVESTOCK track (build coop → stock → tend → sell) ───────────────────────
  // Tend + sell always run cheaply (tend works at home; sell rides village trips).
  if (day >= 8) {
    deliberateTendPens(farmer, 4);
    deliberateSellProducts(farmer, 5);
  }
  // Livestock excursion, AFTER the first tree is planted (so the orchard's quick
  // on-farm hop isn't blocked by the slow coop trip), and NOT on a day we already
  // committed the greenhouse excursion (one far carpentry trip at a time). The
  // build trip goes to the carpenter — and since animals can now be bought there
  // too, the SAME carpentry visit both builds the coop and stocks the first birds.
  if (day >= 8 && quietInvestDay && orchardCount >= 1 && !committedGreenhouseExcursion) {
    if (!hasCoop) {
      deliberateBuildPen(farmer, "coop", "chicken", reserve + 5, 14, -2);
    }
    // Buy whenever the coop exists and the herd is small — fires at the carpenter
    // right after the build, or at the village on a later selling trip.
    if (hasCoop && chickens < 3) {
      deliberateBuyAnimal(farmer, "chicken", reserve + 5, 15, -2);
    }
  }

  // brief 46 — harbor contracts. Conservative only commits when goods are ALREADY
  // in inventory (riskTolerance 0.0 = conservative), ensuring she never misses
  // a deadline. She commits on a quiet day (surplus gold, not plots urgent) and
  // gives the harbor excursion a WINNING travel priority so the delivery trip
  // actually out-prioritizes idle farming. This is the "committed excursion wins"
  // pattern from brief 42.
  const openContracts = (farmer.beliefs?.data.harborOpenContracts as HarborContract[] | undefined) ?? [];
  if (day >= 3) {
    // Conservative: only commit if already have goods (riskTolerance 0.0)
    // OR commit with goods-haul plan early (moderate risk OK by day 10 for extra income)
    const harborTolerance = day >= 10 ? 0.5 : 0.0;
    deliberateHarborContract(farmer, openContracts, harborTolerance, reserve, 5, -2);
  }

  // brief 44 — gathering beat (pure flavor; an idle in-village farmer drifts to
  // the tavern). Runs before the sleep helper so it can claim a truly-idle queue.
  deliberateTavernGather(farmer, -2);
  // brief 45 — on a festival day, gather at the village podium (the festival stage).
  deliberateFestivalGather(farmer, -2);
  deliberateSleep(farmer);
  farmer.intentions.queue.sort((a, b) => a.priority - b.priority);
}

registerPersonality("conservative", deliberateConservative);

// ---------------------------------------------------------------------------
// Peer-trade hooks (encounter-trade system)
// ---------------------------------------------------------------------------

const CONS_PEER_BUY_CEILING = 1.0; // never over shop price
const CONS_PEER_SELL_FLOOR = 0.9;
const CONS_BUFFER_SEEDS = 1;

export const respondToPeerOfferConservative = makeRespondPeerOffer({
  buyCeiling: CONS_PEER_BUY_CEILING,
  sellFloor: CONS_PEER_SELL_FLOOR,
  bufferSeeds: CONS_BUFFER_SEEDS,
  reserveDefault: 30,
});

registerPeerTradeHooks("conservative", {
  respond: respondToPeerOfferConservative,
});
