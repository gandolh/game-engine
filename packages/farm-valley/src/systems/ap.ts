/**
 * AP ordering decision:
 * ApSystem runs AFTER FinishDaySystem in the scheduler.
 * FinishDaySystem resets ap.current = ap.max unconditionally.
 * ApSystem then checks penaltyPending: if set, it overwrites ap.current
 * with ap.penaltyCapacity and clears penaltyPending.
 * This means the penalty applies on the NEXT day after over-spending while away.
 *
 * The FINISH_DAY state transition (FINISH_DAY → WAIT_DAY) is already handled
 * by FinishDaySystem; ApSystem only mutates the ap component.
 */

import type { SimContext, System, World } from "@engine/core";
import type { GameEntity } from "../components";

/**
 * brief 28 — AP cost table.
 *   - travel is FREE in AP (it costs daylight/time instead — brief 27).
 *   - field work (plant/water/harvest) is cheap.
 *   - selling is 3 AP per transaction.
 *   - trade/transaction init is 3 AP BASE, discounted toward friends by trust
 *     (see `tradeInitCost`); the table value is the undiscounted base.
 *   - auction entry is 2 AP; the bid itself is free.
 *   - gifting is 1 AP.
 */
export const AP_COST = {
  plant: 1,
  water: 1, // brief 29 — irrigation action (1 watering-can charge too)
  harvest: 1,
  till: 1,          // create a new plot tile with a hoe (uses 1 hoe durability)
  "chop-tree": 1,   // chop a tree with axe (uses 1 axe durability)
  "mine-stone": 1,  // mine a stone with pickaxe (uses 1 pickaxe durability)
  "refill-can": 2,  // refill watering can at the farm fountain
  "buy-tool": 1,          // buy a tool from the shop
  "upgrade-tool": 2,      // have the blacksmith upgrade a tool (pays gold)
  "craft-decoration": 2,  // craft a farm decoration at the carpentry workshop
  "commission-build": 2,  // brief 44 — commission a build at the carpenter (escrows wood; delivered after build-time)
  "hire-help": 1,         // brief 44 — hire a day-helper at the tavern (pays gold for an AP boost)
  "process-crop": 2,      // mill raw crops into gold at a premium (at the mill)
  "forage": 1,            // forage a seasonal zone (mushroom grove / ice pond)
  "fish": 1,              // cast at a fishing spot — cheap AP, long busy time, lands a fish
  travel: 0, // brief 28 — walking is AP-free (time-throttled)
  negotiate: 3,
  "read-offers": 1,
  "post-offer": 1,
  "buy-seed": 1,
  "sell-shopkeeper": 3,
  "sell-from-wall": 3, // brief 28 — was missing from the table (silently 0)
  "buy-from-wall": 3, // a transaction init — friend-discountable
  "cnp-initiate": 3, // a transaction init — friend-discountable
  "cnp-respond-bid": 1,
  "auction-entry": 2, // brief 28 — pay to contest an auction
  "auction-bid": 0, // the bid itself is free once entered
  "resale-bean": 3,
  "gift-bean": 1,
  idle: 0,
  // brief 42 — livestock and orchard actions
  "build-pen": 3,       // build a pen at the carpenter (consumes wood + gold)
  "buy-animal": 2,      // buy an animal at the village shopkeeper
  "tend": 1,            // tend the pen (raise care + set fedToday)
  "plant-tree": 2,      // plant a fruit tree on a farm tile
  "harvest-fruit": 1,   // collect ready fruit from a mature tree
  "sell-product": 3,    // sell livestock products to the shopkeeper
  "sell-fruit": 3,      // sell fruit to the shopkeeper
} as const;

type KnownIntentKind = keyof typeof AP_COST;

/** Intent kinds whose cost is discounted by trust toward a counterparty. */
const TRADE_INIT_KINDS: ReadonlySet<string> = new Set([
  "buy-from-wall",
  "cnp-initiate",
  "negotiate",
]);

/**
 * brief 28 — tiered friend discount on a trade/transaction init. Cost scales
 * with the initiator's trust toward the counterparty (baseline 0.5):
 *   trust >= 0.7 → 1 AP, trust >= 0.5 → 2 AP, else the 3 AP base.
 */
export function tradeInitCost(trust: number): number {
  if (trust >= 0.7) return 1;
  if (trust >= 0.5) return 2;
  return 3;
}

/** brief 28 — base AP on day 1. */
export const AP_BASE_MAX = 100;
/** brief 28 — the daily AP ceiling grows by this each day. */
export const AP_GROWTH_PER_DAY = 2;

/**
 * brief 28 — the day's AP ceiling: `100 + 2×(day−1)` (day 1 = 100, day 100 =
 * 298). A farmer wakes with this much if it slept at home, or half if unrested
 * (applied at the morning wake in PerceiveSystem). `day` is the 0-based sim day
 * from the clock, so we use `day` directly (day 0 → 100).
 */
export function maxApForDay(day: number): number {
  return AP_BASE_MAX + AP_GROWTH_PER_DAY * Math.max(0, day);
}

function apCostOf(kind: string): number {
  if (kind in AP_COST) return AP_COST[kind as KnownIntentKind];
  return 0; // Unknown intent kinds cost nothing
}

/**
 * Cost of one intent for a given farmer — applies the friend discount to
 * trade-init kinds using the trust toward the intent's counterparty (the
 * `data.counterpartyId` / `data.sellerId` / `data.recipientId` slot, if any).
 */
function apCostForIntent(
  farmer: GameEntity,
  intent: { kind: string; data?: Record<string, unknown> },
): number {
  if (TRADE_INIT_KINDS.has(intent.kind)) {
    const peerId =
      (intent.data?.["sellerId"] as number | undefined) ??
      (intent.data?.["recipientId"] as number | undefined) ??
      (intent.data?.["counterpartyId"] as number | undefined);
    const trust =
      peerId !== undefined ? farmer.trust?.byId.get(peerId) ?? 0.5 : 0.5;
    return tradeInitCost(trust);
  }
  return apCostOf(intent.kind);
}

function isSellIntent(kind: string): boolean {
  // Keep high-priority sell actions last; they are the final revenue-generating step
  return kind === "sell-shopkeeper" || kind === "sell-from-wall";
}

export class ApSystem implements System {
  readonly name = "ApSystem";

  constructor(private readonly world: World<GameEntity>) {}

  run(_ctx: SimContext): void {
    const farmers = this.world.query("fsm", "ap", "intentions");

    for (const farmer of farmers) {
      // --- Pre-ACT intent pruning ---
      // Run before ActSystem: drop low-priority intents if AP insufficient.
      // brief 27 — AP is a daily budget refilled at the morning PHASE_START
      // (PerceiveSystem), NOT here. The old WAIT_DAY refill/penalty block was
      // removed: with the intra-day timeline, FINISH_DAY→WAIT_DAY happens once
      // per phase, so any refill keyed on WAIT_DAY would top up every phase.
      // The rested/unrested halving now lives in the morning wake.
      if (farmer.fsm.current === "ACT") {
        this.pruneAndDeductAp(farmer);
      }
    }
  }

  private pruneAndDeductAp(farmer: GameEntity & { ap: NonNullable<GameEntity["ap"]>; intentions: NonNullable<GameEntity["intentions"]> }): void {
    const queue = farmer.ap ? farmer.intentions.queue : [];
    const available = farmer.ap.current;

    // Calculate total cost of all queued intentions (friend-discounted).
    let totalCost = queue.reduce((sum, intent) => sum + apCostForIntent(farmer, intent), 0);

    if (totalCost > available) {
      // Keep most-important intents first; drop lowest-priority (highest number) ones.
      // Sell-* actions are protected and always sorted to the front regardless of priority number.
      const sorted = [...queue].sort((a, b) => {
        const aSell = isSellIntent(a.kind) ? 0 : 1;
        const bSell = isSellIntent(b.kind) ? 0 : 1;
        if (aSell !== bSell) return aSell - bSell; // sell intents come first (protected)
        // Among same group: keep lowest priority number (most important) first
        return a.priority - b.priority;
      });

      const kept: typeof queue = [];
      let keptCost = 0;
      for (const intent of sorted) {
        const cost = apCostForIntent(farmer, intent);
        if (keptCost + cost <= available) {
          kept.push(intent);
          keptCost += cost;
        }
        // Else drop this intent (it didn't fit within available AP)
      }

      // Restore original queue with only kept intents (preserve original ordering)
      farmer.intentions.queue.length = 0;
      for (const intent of kept) {
        farmer.intentions.queue.push(intent);
      }
      totalCost = keptCost;
    }

    // Deduct AP
    farmer.ap.current = Math.max(0, farmer.ap.current - totalCost);

    // Determine if any kept intent involves travel (farmer will be away)
    const hasTravel = farmer.intentions.queue.some((i) => i.kind === "travel");
    if (hasTravel) {
      farmer.ap.away = true;
    }

    // If farmer is away and has zero AP remaining, mark penalty for next day
    if (farmer.ap.away && farmer.ap.current === 0) {
      farmer.ap.penaltyPending = true;
    }
  }
}
