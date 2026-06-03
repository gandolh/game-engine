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

export const AP_COST = {
  plant: 1,
  harvest: 1,
  travel: 2,
  negotiate: 2,
  "read-offers": 1,
  "post-offer": 1,
  "buy-seed": 1,
  "sell-shopkeeper": 2,
  "buy-from-wall": 2,
  "cnp-initiate": 2,
  "cnp-respond-bid": 1,
  // brief 24 — bidding is intentionally cheap so auctions stay lively; reselling
  // a won bean is a shop transaction like selling crops. (Brief 28 revisits the
  // whole table; these keep the new intents from silently costing 0.)
  "auction-bid": 0,
  "resale-bean": 2,
  idle: 0,
} as const;

type KnownIntentKind = keyof typeof AP_COST;

function apCostOf(kind: string): number {
  if (kind in AP_COST) return AP_COST[kind as KnownIntentKind];
  return 0; // Unknown intent kinds cost nothing
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

    // Calculate total cost of all queued intentions
    let totalCost = queue.reduce((sum, intent) => sum + apCostOf(intent.kind), 0);

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
        const cost = apCostOf(intent.kind);
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
