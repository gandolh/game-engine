import type { AuctionCfpBody } from "../../protocols/shop";

export type SealedBid = { bidderId: number; amount: number; tickReceived: number };

/** Deterministic sealed-bid comparator: amount desc, tickReceived asc, bidderId asc.
 *  This ordering is the determinism anchor — do not alter it. */
export const compareSealedBids = (x: SealedBid, y: SealedBid): number => {
  if (y.amount !== x.amount) return y.amount - x.amount;
  if (x.tickReceived !== y.tickReceived) return x.tickReceived - y.tickReceived;
  return x.bidderId - y.bidderId;
};

export interface VickreyState {
  type: "vickrey";
  cfp: AuctionCfpBody;
  bids: SealedBid[];
  resolved: boolean;
}

export interface FpsbState {
  type: "fpsb";
  cfp: AuctionCfpBody;
  /** Same sealed-bid shape as Vickrey — only the price rule differs. */
  bids: SealedBid[];
  resolved: boolean;
}

export interface DutchState {
  type: "dutch";
  cfp: AuctionCfpBody;
  /** Starting price = reservePrice for our simple model. */
  startPrice: number;
  /** How much the price drops per tick. */
  decrementPerTick: number;
  /** Floor below which the price will not go. */
  floor: number;
  /** First tick at which this auction was observed; `null` until anchored. */
  startTick: number | null;
  /** First-accept wins — null if open. */
  winner: { bidderId: number; paidPrice: number } | null;
  participants: Set<number>;
  resolved: boolean;
}

export interface EnglishState {
  type: "english";
  cfp: AuctionCfpBody;
  /** Opening price = reservePrice. */
  startPrice: number;
  /** How much the asking price rises per tick. */
  incrementPerTick: number;
  /** Close the auction after this many ticks with no affirming bid. */
  noBidTimeout: number;
  /** First tick at which this auction was observed; `null` until anchored. */
  startTick: number | null;
  /**
   * Highest affirming bidder so far. Each affirm at the current ask replaces
   * this; the last/highest affirmer wins at the price they affirmed.
   */
  leader: { bidderId: number; paidPrice: number } | null;
  /** Tick of the most recent affirming bid (drives the no-bid timeout). */
  lastBidTick: number | null;
  participants: Set<number>;
  resolved: boolean;
}

export type AuctionState = VickreyState | FpsbState | DutchState | EnglishState;

export interface DutchAuctionOptions {
  startPrice?: number;
  decrementPerTick?: number;
  floor?: number;
}

export interface EnglishAuctionOptions {
  incrementPerTick?: number;
  noBidTimeout?: number;
}

export function uniqueParticipants(ids: readonly number[]): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
