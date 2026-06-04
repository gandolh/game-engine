// Hoarder farmer personality — CNP initiator for buying radishes from peers.
// Enqueues intentions: plant, buy-seed, cnp-initiate, cnp-respond-bid, read-offers, buy-from-wall.
import type { GameEntity, CropKind } from "../components";
import { recordReason, resetDecisionTrace } from "../components";
import { registerPersonality, type DeliberateContext } from "./registry";
import { ONT_CNP } from "../protocols/cnp";
import { ONT_MARKET, type MarketOffer } from "../protocols/market";
import { PERFORMATIVE } from "../protocols/performatives";
import {
  getOrCreateCoordinator,
  _resetCnpCoordinatorsForTests,
} from "./cnp-registry";
import {
  registerPeerTradeHooks,
  type InitiatePeerTradeFn,
  type RespondPeerOfferFn,
} from "./peer-trade-registry";
import { deliberateBean } from "./bean-valuation";
import { deliberateWatering, deliberateRefillCan, deliberateTill, deliberateBuyTool, deliberateResourceGather, deliberateDecoration, deliberateUpgrade, deliberateResourceZoneVisit, deliberateEarlyVillageVisit, deliberateSleep, deliberatePeriodicMarketVisit, deliberateSeasonalForage } from "./watering";
import type { PlotWaterSense } from "../systems/plot-sense";
import type { TileFeature, FarmDecoration } from "../components";

export { _resetCnpCoordinatorsForTests };

const SHOP_PRICE: Record<CropKind, number> = { radish: 8, wheat: 14, pumpkin: 35 };
const SEED_COST: Record<CropKind, number> = { radish: 5, wheat: 8, pumpkin: 15 };
const HIGH_TIER: readonly CropKind[] = ["pumpkin", "wheat"]; // pumpkin/corn alternating; corn unavailable, use wheat
const CNP_PERIOD_DAYS = 3;
const CNP_DEFAULT_DEADLINE_TICKS = 2;
const CNP_TARGET_QUANTITY = 3;
const BUY_PRICE_MULTIPLIER = 1.05; // up to 105% of shop price

function pickHighTier(plotId: number): CropKind {
  // Alternate by plot id parity (pumpkin / wheat as a corn-stand-in).
  return HIGH_TIER[plotId % HIGH_TIER.length]!;
}

export function deliberateHoarder(farmer: GameEntity, ctx: DeliberateContext): void {
  if (!farmer.beliefs || !farmer.desires || !farmer.intentions || !farmer.inventory) return;
  if (farmer.id === undefined) return;

  const reserve = (farmer.desires.data["minGoldReserve"] as number | undefined) ?? 80;
  const day = (farmer.beliefs.data["currentDay"] as number | undefined) ?? ctx.tick;
  const coord = getOrCreateCoordinator(farmer.id);
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

  // 1. Plant a high-tier crop, falling back to radish only if we can't afford anything else.
  const plotId = (farmer.beliefs.data["plotId"] as number | undefined) ?? farmer.id;
  const preferred = pickHighTier(plotId);
  let chosen: CropKind | null = null;
  let chosenMode: "plant" | "buy-seed" = "plant";

  if (farmer.inventory.seeds[preferred] >= 1) {
    chosen = preferred;
  } else if (farmer.inventory.gold - SEED_COST[preferred] >= reserve) {
    chosen = preferred;
    chosenMode = "buy-seed";
  } else {
    // Try the other high-tier crop.
    const other = HIGH_TIER.find((c) => c !== preferred)!;
    if (farmer.inventory.seeds[other] >= 1) {
      chosen = other;
    } else if (farmer.inventory.gold - SEED_COST[other] >= reserve) {
      chosen = other;
      chosenMode = "buy-seed";
    } else if (farmer.inventory.seeds.radish >= 1) {
      chosen = "radish";
    } else if (farmer.inventory.gold - SEED_COST.radish >= reserve) {
      chosen = "radish";
      chosenMode = "buy-seed";
    }
  }

  if (chosen) {
    farmer.intentions.queue.push({
      kind: chosenMode,
      data:
        chosenMode === "plant"
          ? { crop: chosen }
          : { crop: chosen, quantity: 1 },
      priority: chosenMode === "plant" ? 1 : 2,
    });
    if (chosenMode === "plant") {
      recordReason(farmer, `plant ${chosen}: high-tier on hand`);
    } else {
      recordReason(farmer, `buy seed ${chosen}: short on seeds`);
    }
  }

  // 2. CNP — every CNP_PERIOD_DAYS, initiate a task to buy radishes from peers.
  if (day > 0 && day % CNP_PERIOD_DAYS === 0) {
    const taskId = `cnp-${farmer.id}-${day}`;
    if (!coord.getTask(taskId)) {
      const deadlineTick = ctx.tick + CNP_DEFAULT_DEADLINE_TICKS;
      coord.startTask({
        taskId,
        initiatorId: farmer.id,
        buyCrop: "radish",
        quantity: CNP_TARGET_QUANTITY,
        maxPricePerUnit: SHOP_PRICE.radish,
        deadlineTick,
      });
      farmer.intentions.queue.push({
        kind: "cnp-initiate",
        data: {
          ontology: ONT_CNP.TASK,
          performative: PERFORMATIVE.CFP,
          taskId,
          crop: "radish",
          quantity: CNP_TARGET_QUANTITY,
          maxPricePerUnit: SHOP_PRICE.radish,
          deadlineTick,
        },
        priority: 3,
      });
      recordReason(farmer, `cnp radish x${CNP_TARGET_QUANTITY}: hoard via peers`);
    }
  }

  // 3. Close any CNP tasks whose deadline has arrived this tick.
  for (const task of coord.dueTasks(ctx.tick)) {
    const winnerId = coord.closeTask(task.taskId, ctx.tick);
    // ACCEPT to winner, REJECT to losers — emitted as cnp-respond-bid intentions
    // (the market/shop slice consumes them as message sends).
    for (const proposal of task.proposals) {
      const isWinner = proposal.bidderId === winnerId;
      farmer.intentions.queue.push({
        kind: "cnp-respond-bid",
        data: {
          ontology: isWinner ? ONT_CNP.ACCEPT : ONT_CNP.REJECT,
          performative: isWinner ? PERFORMATIVE.ACCEPT : PERFORMATIVE.REJECT,
          taskId: task.taskId,
          recipientId: proposal.bidderId,
        },
        priority: 4,
      });
      recordReason(
        farmer,
        `cnp ${isWinner ? "accept" : "reject"} bid ${proposal.bidderId}`,
      );
    }
  }

  // 4. Read the market wall and buy radish offers up to 105% of shop price,
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
    .filter((o) => o.pricePerUnit <= SHOP_PRICE[o.crop] * BUY_PRICE_MULTIPLIER)
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
  deliberateSleep(farmer);
  farmer.intentions.queue.sort((a, b) => a.priority - b.priority);
}

registerPersonality("hoarder", deliberateHoarder);

// ---------------------------------------------------------------------------
// Peer-trade hooks (encounter-trade system)
// ---------------------------------------------------------------------------

// Shop reference prices used by the peer-trade acceptance heuristics. These
// mirror the shopkeeper's daily SELL prices defined in `act.ts`.
const PEER_SHOP_SELL_PRICE: Record<CropKind, number> = {
  radish: 8,
  wheat: 14,
  pumpkin: 35,
};

const HOARDER_INITIATE_QTY = 3;
const HOARDER_INITIATE_PRICE_RADISH = 4.5;
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
  const unitPrice = HOARDER_INITIATE_PRICE_RADISH;

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

export const respondToPeerOfferHoarder: RespondPeerOfferFn = (
  farmer,
  offer,
  _sender,
  _ctx,
) => {
  if (!farmer.inventory) return { decision: "decline", reason: "no-inventory" };
  const reserve =
    (farmer.desires?.data["minGoldReserve"] as number | undefined) ?? 80;
  const ref = PEER_SHOP_SELL_PRICE[offer.crop];

  if (offer.direction === "sell") {
    // Someone is selling to us — we'd buy.
    if (offer.unitPrice > ref * HOARDER_PEER_BUY_CEILING) {
      return { decision: "decline", reason: "price-too-high" };
    }
    const cost = offer.unitPrice * offer.quantity;
    if (farmer.inventory.gold - cost < reserve) {
      return { decision: "decline", reason: "would-breach-reserve" };
    }
    return { decision: "accept" };
  }

  // direction === "buy" — someone wants to buy from us; we'd sell seeds.
  if (offer.unitPrice < ref * HOARDER_PEER_SELL_FLOOR) {
    return { decision: "decline", reason: "price-too-low" };
  }
  if (
    farmer.inventory.seeds[offer.crop] <
    offer.quantity + HOARDER_BUFFER_SEEDS
  ) {
    return { decision: "decline", reason: "would-deplete-buffer" };
  }
  return { decision: "accept" };
};

registerPeerTradeHooks("hoarder", {
  initiate: initiatePeerTradeHoarder,
  respond: respondToPeerOfferHoarder,
});
