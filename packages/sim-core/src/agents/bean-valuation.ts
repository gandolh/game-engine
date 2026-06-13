import type { GameEntity } from "../components";
import { recordReason } from "../components";
import type { AuctionCfpBody } from "../protocols/shop";

/**
 * Shared golden-bean valuation. A bean is worth `reservePrice × RESALE_MULTIPLIER`
 * resale; each personality bids that scaled by `valueFactor` ∈ (0,1], capped to
 * keep `minGoldReserve`. No randomness.
 */

/** Must mirror `GOLDEN_BEAN_RESALE_MULTIPLIER` in systems/shopkeeper.ts. */
export const RESALE_MULTIPLIER = 3;

export interface BeanBidParams {
  /** Fraction of the bean's expected resale value this personality will bid. */
  valueFactor: number;
}

/** Returns bid amount, or null if unaffordable. Integer in [reservePrice, expectedResale], clamped to gold. */
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

  const affordable = inv.gold - minGoldReserve;
  if (affordable < reserve) return null;

  const expectedResale = reserve * RESALE_MULTIPLIER;
  const target = Math.max(reserve, Math.round(expectedResale * params.valueFactor));
  const bid = Math.min(target, affordable);
  return bid >= reserve ? bid : null;
}

/**
 * Shared bean deliberation: pushes an auction bid (sized by `valueFactor`) and a resale
 * of any beans already held. Callers must guard `intentions`, `beliefs`, `inventory`.
 */
export function deliberateBean(
  farmer: GameEntity,
  valueFactor: number,
  options: { resell?: boolean } = {},
): void {
  const resell = options.resell ?? true;
  // Per-agent baked jitter (bdi-jitter.ts) overrides the kind's literal when present.
  const factor =
    (farmer.desires?.data.beanValueFactor as number | undefined) ?? valueFactor;
  const open = farmer.beliefs?.data.openAuction as AuctionCfpBody | undefined;
  if (open) {
    const bid = expectedBeanBid(farmer, open, { valueFactor: factor });
    if (bid !== null) {
      // Contesting an auction costs 2 AP to enter (AP gate, no world effect).
      // Entry has higher priority number so it's dropped first by the pruner.
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
