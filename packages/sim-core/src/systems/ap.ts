// ApSystem runs AFTER FinishDaySystem; it only prunes + deducts AP in ACT state.
// Penalty application and rested/unrested refill happen in PerceiveSystem (morning wake).

import type { SimContext, System, World } from "@engine/core";
import type { GameEntity } from "../components";

/** AP cost table. Travel is free (time-throttled). Trade-init (3 base) is discounted by trust; see tradeInitCost. */
export const AP_COST = {
  plant: 1,
  water: 1, // also consumes 1 watering-can charge
  harvest: 1,
  till: 1,          // uses 1 hoe durability
  "chop-tree": 1,   // uses 1 axe durability
  "mine-stone": 1,  // uses 1 pickaxe durability
  "refill-can": 2,  // refill watering can at the farm fountain
  "buy-tool": 1,
  "upgrade-tool": 2,
  "craft-decoration": 2,
  "commission-build": 2,  // escrows wood; decoration delivered after build-time
  "hire-help": 1,         // pays gold for a same-day AP boost (see HELPER_AP_BOOST)
  "process-crop": 2,
  "forage": 1,
  "fish": 1,              // cheap AP, long busy time
  // coral-fishing: boarding/returning free (like travel); coral cast costs 3 vs 1 shore — premium catch gated by real AP budget
  "board-boat": 0,
  "return-to-shore": 0,
  "fish-coral": 3,
  travel: 0, // walking is AP-free (time-throttled)
  negotiate: 3,
  "read-offers": 1,
  "post-offer": 1,
  "buy-seed": 1,
  "sell-shopkeeper": 3,
  "sell-from-wall": 3,
  "buy-from-wall": 3, // trade-init — friend-discountable
  "cnp-initiate": 3, // trade-init — friend-discountable
  "cnp-respond-bid": 1,
  "auction-entry": 2,
  "auction-bid": 0, // bid is free once you've paid entry
  "resale-bean": 3,
  "gift-bean": 1,
  idle: 0,
  "build-pen": 3,
  "buy-animal": 2,
  "tend": 1,            // raise pen care + set fedToday
  "plant-tree": 2,
  "harvest-fruit": 1,
  "sell-product": 3,
  "sell-fruit": 3,
  "commit-contract": 1,
  "deliver-contract": 3,
  "build-greenhouse": 3,
  "pray-at-shrine": 0, // AP-free — grants AP; cost gate is the trip + ~5-day cooldown
} as const;

type KnownIntentKind = keyof typeof AP_COST;

/** Intent kinds whose cost is discounted by trust toward a counterparty. */
const TRADE_INIT_KINDS: ReadonlySet<string> = new Set([
  "buy-from-wall",
  "cnp-initiate",
  "negotiate",
]);

/** Tiered trade-init cost: trust≥0.7→1 AP, ≥0.5→2 AP, else 3 (baseline 0.5). */
export function tradeInitCost(trust: number): number {
  if (trust >= 0.7) return 1;
  if (trust >= 0.5) return 2;
  return 3;
}

/** Shrine AP top-up — clamped to maxApForDay so it can't snowball a leader. Once per ~5 days. */
export const SHRINE_AP_BOOST = 12;
export const SHRINE_COOLDOWN_DAYS = 5;

/** Same-day AP boost from hiring tavern help. Clamped to maxApForDay+HELPER_AP_MARGIN so gold-rich leaders can't snowball. */
export const HELPER_AP_BOOST = 25;
export const HELPER_AP_MARGIN = 25;

export const AP_BASE_MAX = 100;
export const AP_GROWTH_PER_DAY = 2;

/** Day's AP ceiling: 100 + 2×day (0-based). Halved if unrested (applied at morning wake in PerceiveSystem). */
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
  return kind === "sell-shopkeeper" || kind === "sell-from-wall";
}

export class ApSystem implements System {
  readonly name = "ApSystem";

  constructor(private readonly world: World<GameEntity>) {}

  run(_ctx: SimContext): void {
    const farmers = this.world.query("fsm", "ap", "intentions");

    for (const farmer of farmers) {
        if (farmer.fsm.current === "ACT") {
        this.pruneAndDeductAp(farmer);
      }
    }
  }

  private pruneAndDeductAp(farmer: GameEntity & { ap: NonNullable<GameEntity["ap"]>; intentions: NonNullable<GameEntity["intentions"]> }): void {
    const queue = farmer.ap ? farmer.intentions.queue : [];
    const available = farmer.ap.current;

    let totalCost = queue.reduce((sum, intent) => sum + apCostForIntent(farmer, intent), 0);

    if (totalCost > available) {
      const sorted = [...queue].sort((a, b) => {
        const aSell = isSellIntent(a.kind) ? 0 : 1;
        const bSell = isSellIntent(b.kind) ? 0 : 1;
        if (aSell !== bSell) return aSell - bSell;
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
      }

      farmer.intentions.queue.length = 0;
      for (const intent of kept) {
        farmer.intentions.queue.push(intent);
      }
      totalCost = keptCost;
    }

    farmer.ap.current = Math.max(0, farmer.ap.current - totalCost);

    const hasTravel = farmer.intentions.queue.some((i) => i.kind === "travel");
    if (hasTravel) {
      farmer.ap.away = true;
    }

    if (farmer.ap.away && farmer.ap.current === 0) {
      farmer.ap.penaltyPending = true;
    }
  }
}
