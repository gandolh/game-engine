// Hoarder farmer personality — CNP initiator for buying radishes from peers.
// Enqueues intentions: plant, buy-seed, cnp-initiate, cnp-respond-bid, read-offers, buy-from-wall.
import type { GameEntity, CropKind } from "../components";
import { registerPersonality, type DeliberateContext } from "./registry";
import { ONT_CNP } from "../protocols/cnp";
import { ONT_MARKET, type MarketOffer } from "../protocols/market";
import { PERFORMATIVE } from "../protocols/performatives";
import { CnpCoordinator } from "./cnp-coordinator";

const SHOP_PRICE: Record<CropKind, number> = { radish: 8, wheat: 14, pumpkin: 35 };
const SEED_COST: Record<CropKind, number> = { radish: 5, wheat: 8, pumpkin: 15 };
const HIGH_TIER: readonly CropKind[] = ["pumpkin", "wheat"]; // pumpkin/corn alternating; corn unavailable, use wheat
const CNP_PERIOD_DAYS = 3;
const CNP_DEFAULT_DEADLINE_TICKS = 2;
const CNP_TARGET_QUANTITY = 3;
const BUY_PRICE_MULTIPLIER = 1.05; // up to 105% of shop price

// One coordinator per farmer entity. Keyed by farmer.id so multiple hoarders coexist.
const coordinators = new Map<number, CnpCoordinator>();

export function _resetCnpCoordinatorsForTests(): void {
  coordinators.clear();
}

function getCoordinator(farmerId: number): CnpCoordinator {
  let c = coordinators.get(farmerId);
  if (!c) {
    c = new CnpCoordinator();
    coordinators.set(farmerId, c);
  }
  return c;
}

function pickHighTier(plotId: number): CropKind {
  // Alternate by plot id parity (pumpkin / wheat as a corn-stand-in).
  return HIGH_TIER[plotId % HIGH_TIER.length]!;
}

export function deliberateHoarder(farmer: GameEntity, ctx: DeliberateContext): void {
  if (!farmer.beliefs || !farmer.desires || !farmer.intentions || !farmer.inventory) return;
  if (farmer.id === undefined) return;

  const reserve = (farmer.desires.data["minGoldReserve"] as number | undefined) ?? 80;
  const day = (farmer.beliefs.data["currentDay"] as number | undefined) ?? ctx.tick;
  const coord = getCoordinator(farmer.id);
  const inVillage = farmer.farmer?.currentRegion === "village";

  farmer.intentions.queue.length = 0;

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
    }
  }

  // 4. Read the market wall and buy radish offers up to 105% of shop price,
  //    prioritized by trust score (highest trust first).
  farmer.intentions.queue.push({
    kind: "read-offers",
    data: { ontology: ONT_MARKET.READ_OFFERS, filter: { crop: "radish" } },
    priority: 5,
  });

  const offers = (farmer.beliefs.data["marketOffers"] as MarketOffer[] | undefined) ?? [];
  const trust = farmer.trust?.byId;
  // TODO: real trust updates land in a future ticket; default to 0.5 for unseen peers.
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
    budget -= cost;
  }

  farmer.intentions.queue.sort((a, b) => a.priority - b.priority);
}

registerPersonality("hoarder", deliberateHoarder);
