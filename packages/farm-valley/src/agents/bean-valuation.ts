import type { GameEntity } from "../components";
import { recordReason } from "../components";
import type { AuctionCfpBody } from "../protocols/shop";

/**
 * brief 24 — shared golden-bean valuation.
 *
 * A bean is worth roughly its shop resale value (the shop buys a won bean back
 * at `reserve × resaleMultiplier`). Each personality bids that ceiling scaled
 * by a `valueFactor` ∈ (0,1]: aggressive bids near the full value, conservative
 * bids near the reserve. The bid is always capped so the farmer keeps its
 * `minGoldReserve` after paying — a bid it can actually afford.
 *
 * Pure function of the farmer's state (gold, reserve) + the CFP. No randomness.
 */

/** Mirrors `GOLDEN_BEAN_RESALE_MULTIPLIER` in systems/shopkeeper.ts. */
export const RESALE_MULTIPLIER = 3;

export interface BeanBidParams {
  /** Fraction of the bean's expected resale value this personality will bid. */
  valueFactor: number;
}

/**
 * Returns the bid amount this farmer should place on the open auction, or
 * `null` if it shouldn't bid (can't afford even the reserve while keeping its
 * gold reserve, or the auction isn't a kind it contests). The amount is an
 * integer in `[reserve, expectedResale]` clamped to affordability.
 */
export function expectedBeanBid(
  farmer: GameEntity,
  cfp: AuctionCfpBody,
  params: BeanBidParams,
): number | null {
  const inv = farmer.inventory;
  if (!inv) return null;
  const reserve = cfp.reservePrice;
  const minGoldReserve =
    (farmer.desires?.data.minGoldReserve as number | undefined) ?? 0;

  // Most we can spend while keeping our gold reserve intact.
  const affordable = inv.gold - minGoldReserve;
  if (affordable < reserve) return null; // can't even meet the reserve

  const expectedResale = reserve * RESALE_MULTIPLIER;
  // Target bid = personality fraction of expected resale, floored at reserve.
  const target = Math.max(reserve, Math.round(expectedResale * params.valueFactor));
  // Never bid more than we can afford.
  const bid = Math.min(target, affordable);
  return bid >= reserve ? bid : null;
}

/**
 * brief 24 — shared bean deliberation, called from each `deliberate*` fn.
 * Pushes (a) a bid on the open auction (if any, sized by `valueFactor`), and
 * (b) a resale of any beans already held — beans are won to be flipped for
 * gold (or gifted; gifting is handled in the encounter peer-trade hooks).
 * Records terse reasons into the decision trace. Assumes `intentions`,
 * `beliefs`, and `inventory` are present (callers already guard these).
 */
export function deliberateBean(
  farmer: GameEntity,
  valueFactor: number,
  options: { resell?: boolean } = {},
): void {
  const resell = options.resell ?? true;
  const open = farmer.beliefs?.data.openAuction as AuctionCfpBody | undefined;
  if (open) {
    const bid = expectedBeanBid(farmer, open, { valueFactor });
    if (bid !== null) {
      // brief 28 — contesting an auction costs 2 AP to enter; the bid is free.
      // auction-entry is a pure AP gate (no world effect); if AP can't cover
      // it the pruner drops both it and the bid together (entry has higher
      // priority number so it's dropped first, taking the bid's intent with it
      // only when neither fits — see priorities below).
      farmer.intentions!.queue.push({
        kind: "auction-entry",
        data: { auctionId: open.auctionId },
        priority: 1,
      });
      farmer.intentions!.queue.push({
        kind: "auction-bid",
        data: { auctionId: open.auctionId, amount: bid },
        priority: 1,
      });
      recordReason(farmer, `bid bean ${bid}g (reserve ${open.reservePrice})`);
    }
  }

  const beans = farmer.inventory?.goldenBeans ?? 0;
  if (resell && beans > 0) {
    farmer.intentions!.queue.push({
      kind: "resale-bean",
      data: { quantity: beans },
      priority: 0,
    });
    recordReason(farmer, `resell ${beans} golden bean${beans > 1 ? "s" : ""}`);
  }
}
