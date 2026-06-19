

import type { SimContext, System, World } from "@engine/core";
import type { GameEntity } from "../components";

export const AP_COST = {
  plant: 1,
  water: 1, 
  harvest: 1,
  till: 1,          
  "chop-tree": 1,   
  "mine-stone": 1,  
  "refill-can": 2,  
  "buy-tool": 1,
  "upgrade-tool": 2,
  "craft-decoration": 2,
  "commission-build": 2,  
  "hire-help": 1,         
  "process-crop": 2,
  "forage": 1,
  "fish": 1,              

  "board-boat": 0,
  "return-to-shore": 0,
  "fish-coral": 3,
  travel: 0, 
  negotiate: 3,
  "read-offers": 1,
  "post-offer": 1,
  "buy-seed": 1,
  "sell-shopkeeper": 3,
  "sell-from-wall": 3,
  "buy-from-wall": 3, 
  "cnp-initiate": 3, 
  "cnp-respond-bid": 1,
  "auction-entry": 2,
  "auction-bid": 0, 
  "resale-bean": 3,
  "gift-bean": 1,
  idle: 0,
  "build-pen": 3,
  "buy-animal": 2,
  "tend": 1,            
  "plant-tree": 2,
  "harvest-fruit": 1,
  "sell-product": 3,
  "sell-fruit": 3,
  "commit-contract": 1,
  "deliver-contract": 3,
  "build-greenhouse": 3,
  "pray-at-shrine": 0, 
} as const;

type KnownIntentKind = keyof typeof AP_COST;

const TRADE_INIT_KINDS: ReadonlySet<string> = new Set([
  "buy-from-wall",
  "cnp-initiate",
  "negotiate",
]);

export function tradeInitCost(trust: number): number {
  if (trust >= 0.7) return 1;
  if (trust >= 0.5) return 2;
  return 3;
}

export const SHRINE_AP_BOOST = 12;
export const SHRINE_COOLDOWN_DAYS = 5;

export const HELPER_AP_BOOST = 25;
export const HELPER_AP_MARGIN = 25;

export const AP_BASE_MAX = 100;
export const AP_GROWTH_PER_DAY = 2;

export function maxApForDay(day: number): number {
  return AP_BASE_MAX + AP_GROWTH_PER_DAY * Math.max(0, day);
}

function apCostOf(kind: string): number {
  if (kind in AP_COST) return AP_COST[kind as KnownIntentKind];
  return 0; 
}

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
