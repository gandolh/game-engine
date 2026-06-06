// Aggressive farmer personality.
// Enqueues intentions: plant, buy-seed, sell-shopkeeper, post-offer, read-offers, buy-from-wall.
import type { GameEntity, CropKind } from "../components";
import { recordReason, resetDecisionTrace } from "../components";
import { registerPersonality, type DeliberateContext } from "./registry";
import { ONT_MARKET, type MarketOffer } from "../protocols/market";
import {
  registerPeerTradeHooks,
  type InitiateBeanGiftFn,
} from "./peer-trade-registry";
import { makeRespondPeerOffer } from "./peer-trade-policy";
import { CROP_SELL_PRICE, SEED_COST, CROP_SEASON } from "../economy";
import { seasonForDay } from "../protocols/weather";
import { deliberateBean } from "./bean-valuation";
import { deliberateWatering, deliberateRefillCan, deliberateTill, deliberateBuyTool, deliberateResourceGather, deliberateUpgrade, deliberateResourceZoneVisit, deliberateEarlyVillageVisit, deliberateSleep, deliberatePeriodicMarketVisit, deliberateMillVisit, deliberateFishing, deliberatePlantNearby, deliberateTendPens, deliberateSellProducts, deliberateHarvestFruit, deliberateSellFruit, deliberateCommissionBuild, deliberateHireHelp, deliberateTavernGather, deliberateFestivalGather } from "./watering";
import type { PlotWaterSense } from "../systems/plot-sense";
import type { TileFeature, FarmDecoration } from "../components";

const UNDERCUT_THRESHOLD = 0.9; // buy offers below 90% of shop price

/**
 * brief 41 — aggressive picks the highest-value IN-SEASON crop first. During
 * storm/rain downgrade to the cheapest in-season option to limit risk.
 */
function chooseTargetCrop(
  farmer: GameEntity,
  reserve: number,
  day: number,
): { crop: CropKind; mode: "plant" | "buy-seed" } | null {
  if (!farmer.inventory) return null;
  const gold = farmer.inventory.gold;
  const weather = (farmer.beliefs?.data["weather"] as { current?: string } | undefined)?.current;
  const season = seasonForDay(day);

  // In-season crops ranked by value desc (aggressive chases premium).
  const allCrops: CropKind[] = ["grape", "corn", "pumpkin", "tomato", "winter-squash", "wheat", "carrot", "radish"];
  // Under storm/rainy: prefer cheap fast crops (radish/carrot).
  const isBadWeather = weather === "storm" || weather === "rainy";
  const order: CropKind[] = isBadWeather
    ? allCrops.filter(c => CROP_SEASON[c] === season).reverse() // cheapest first
    : allCrops.filter(c => CROP_SEASON[c] === season);          // most profitable first

  // Fall back to all crops if nothing in-season is affordable.
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

  // Refill can if short (aggressive only refills when can is empty or nearly so).
  const sense = farmer.beliefs.data.plotWater as PlotWaterSense | undefined;
  const planWater = Math.min(sense?.due ?? 0, 3);
  deliberateRefillCan(farmer, planWater);

  // brief 29 — aggressive over-plants and waters lazily (threshold 1), capping
  // watering so it may let a marginal plot die rather than tend every one.
  deliberateWatering(farmer, { dryThreshold: 1, maxWaterPerDay: 3 });

  // Aggressive expands plots quickly — till up to 3 new plots per day.
  const plotsOwned = sense?.planted ?? 0;
  if (plotsOwned < 9) {
    const occupied = new Set<string>((farmer.beliefs.data.occupiedTiles as string[] | undefined) ?? []);
    deliberateBuyTool(farmer, "hoe", 2);
    deliberateTill(farmer, occupied, 3, 3);
  }
  // Chop/mine up to 2 features aggressively (resources = sellable goods).
  const features = (farmer.beliefs.data.tileFeatures as TileFeature[] | undefined) ?? [];
  deliberateResourceGather(farmer, features, 2, 7);

  // brief 44 — commission decorations at the CARPENTER (a real order the
  // CarpenterSystem validates + delivers over a build-time), replacing the old
  // instant craft. Aggressive chops a lot of wood, so it's the natural farmer to
  // close the carpenter loop. Uses the brief-42 excursion discipline: on a quiet
  // invest day commit a WINNING carpentry-travel leg so the trip actually lands.
  const decorations = (farmer.beliefs.data.decorations as FarmDecoration[] | undefined) ?? [];
  const plotsUrgentAggr = (sense?.maxDrySoFar ?? 0) >= 2;
  const apHeadroomAggr = (farmer.ap?.current ?? 0) >= 20;
  const quietInvestDayAggr = !plotsUrgentAggr && apHeadroomAggr;
  deliberateCommissionBuild(farmer, decorations, 6, quietInvestDayAggr ? -2 : undefined);

  // Aggressive mills its high-volume surplus for the premium.
  deliberateMillVisit(farmer, 10, 6);

  // Visit village day 0-1 to scope the market fast.
  deliberateEarlyVillageVisit(farmer, 5);
  // Aggressive upgrades axe first (wants wood fast for decorations), then hoe.
  deliberateUpgrade(farmer, "axe", 6);
  deliberateUpgrade(farmer, "pickaxe", 7);
  deliberateUpgrade(farmer, "hoe", 8);
  // Visit resource zones when own farm is depleted.
  deliberateResourceZoneVisit(farmer, features.length, "tree", 9);
  deliberateResourceZoneVisit(farmer, features.length, "stone", 10);
  // Occasional fishing trip for opportunistic side income (rarely — aggressive
  // prefers high-volume farming; fishes only every 7 days).
  deliberateFishing(farmer, 7, 2, 11);

  // End-of-sim liquidation: in the last 2 days, dump everything to the
  // shopkeeper and skip planting / market posting / wall scanning.
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
      // Travel must precede the sells positionally; unshift so it lands first
      // even though all liquidation intents share priority 0.
      farmer.intentions.queue.unshift({
        kind: "travel",
        data: { targetRegionId: "village" },
        priority: 0,
      });
      recordReason(farmer, `travel village: have crops to sell`);
    }
    return;
  }

  // 1. Plant / buy seed based on profitability + season + weather.
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

  // 2. Every 2 days, post inventory on market wall at priceMax.
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

    // 3. Every 2 days, scan wall for undercut opportunities.
    farmer.intentions.queue.push({
      kind: "read-offers",
      data: { ontology: ONT_MARKET.READ_OFFERS },
      priority: 4,
    });
    recordReason(farmer, `read offers: scan for undercuts`);

    // If we already have a perceived offer list in beliefs, react to it.
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

  // 4. Liquidate-last-2-days behavior is intentionally skipped — no end-of-sim signal yet.

  // 5. Background fallback: sell crops to shopkeeper if we somehow accumulated them and
  //    today is not a wall-posting day (to keep gold flowing).
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

  // brief 24 — aggressive bids high (near full expected resale) and flips beans.
  deliberateBean(farmer, 0.95);

  deliberatePeriodicMarketVisit(farmer, 3, 6);

  // brief 42 — aggressive mostly skips livestock (AP-hungry); only tends if already has pens,
  // harvests fruit of opportunity.
  deliberateTendPens(farmer, 12);
  deliberateSellProducts(farmer, 12);
  deliberateHarvestFruit(farmer, 12);
  deliberateSellFruit(farmer, 12);

  // brief 44 — hire a day-helper at the tavern when AP-starved + gold-rich (a
  // catch-up sink). Aggressive runs its AP down hard, so it's a good candidate.
  deliberateHireHelp(farmer, reserve, 13, -2);

  // brief 44 — gathering beat: a farmer that came to the village and is now idle
  // drifts to the tavern so the hub looks populated. Runs BEFORE the sleep helper
  // so it can claim a truly-idle queue; the next arrival re-deliberation then
  // sends the farmer home for the night.
  deliberateTavernGather(farmer, -2);
  // brief 45 — festival-day gathering at the village podium.
  deliberateFestivalGather(farmer, -2);

  deliberateSleep(farmer);

  farmer.intentions.queue.sort((a, b) => a.priority - b.priority);
}

registerPersonality("aggressive", deliberateAggressive);

// ---------------------------------------------------------------------------
// Peer-trade hooks (encounter-trade system)
// ---------------------------------------------------------------------------

const AGGR_PEER_BUY_CEILING = 0.95; // discount buyer
const AGGR_PEER_SELL_FLOOR = 1.0;   // sells at shopkeeper ceiling

export const respondToPeerOfferAggressive = makeRespondPeerOffer({
  buyCeiling: AGGR_PEER_BUY_CEILING,
  sellFloor: AGGR_PEER_SELL_FLOOR,
  bufferSeeds: 0,
  reserveDefault: 10,
});

/**
 * brief 24 — aggressive uses a won golden bean as a bribe: gift it to the peer
 * it ALREADY trusts most (>= 0.6), cementing the alliance with a big trust
 * boost rather than flipping it for gold. Only fires when holding a bean (the
 * encounter system guards that) and meeting a sufficiently-trusted peer.
 */
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
  respond: respondToPeerOfferAggressive,
  initiateGift: initiateBeanGiftAggressive,
});
