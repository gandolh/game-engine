import type { GameEntity } from "../components";
import { recordReason } from "../components";
import type { AuctionCfpBody } from "../protocols/shop";

export const RESALE_MULTIPLIER = 3;

export interface BeanBidParams {

  valueFactor: number;
}

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

export function deliberateBean(
  farmer: GameEntity,
  valueFactor: number,
  options: { resell?: boolean } = {},
): void {
  const resell = options.resell ?? true;

  const factor =
    (farmer.desires?.data.beanValueFactor as number | undefined) ?? valueFactor;
  const open = farmer.beliefs?.data.openAuction as AuctionCfpBody | undefined;
  if (open) {
    const bid = expectedBeanBid(farmer, open, { valueFactor: factor });
    if (bid !== null) {

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
