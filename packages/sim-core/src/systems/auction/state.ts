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
  bids: SealedBid[];
  resolved: boolean;
}

export interface DutchState {
  type: "dutch";
  cfp: AuctionCfpBody;
  startPrice: number;
  decrementPerTick: number;
  floor: number;
  startTick: number | null; // anchored on first observation
  winner: { bidderId: number; paidPrice: number } | null; // null if open
  participants: Set<number>;
  resolved: boolean;
}

export interface EnglishState {
  type: "english";
  cfp: AuctionCfpBody;
  startPrice: number;
  incrementPerTick: number;
  noBidTimeout: number;
  startTick: number | null; // anchored on first observation
  leader: { bidderId: number; paidPrice: number } | null; // last affirmer at current ask
  lastBidTick: number | null; // drives no-bid timeout
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
