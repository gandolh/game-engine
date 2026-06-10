// Shared factory for the respondToPeerOffer hook. The four built-in
// personalities (aggressive, hoarder, opportunist, conservative) use an
// identical control-flow structure and differ only in four numeric constants.
// This factory encodes that shared logic once.
import type { RespondPeerOfferFn } from "./peer-trade-registry";
import { CROP_SELL_PRICE } from "../economy";

export interface RespondPeerOfferCfg {
  /** Max multiple of shop price we are willing to pay when buying. */
  buyCeiling: number;
  /** Min multiple of shop price we require when selling. */
  sellFloor: number;
  /**
   * Number of seeds we keep in reserve beyond the quantity requested.
   * Pass 0 for aggressive (no buffer) or a positive integer for personalities
   * that protect their seed stock.
   */
  bufferSeeds: number;
  /** Default minGoldReserve if the desires component has no value. */
  reserveDefault: number;
}

export function makeRespondPeerOffer(cfg: RespondPeerOfferCfg): RespondPeerOfferFn {
  const { buyCeiling, sellFloor, bufferSeeds, reserveDefault } = cfg;
  return (farmer, offer, _sender, _ctx) => {
    if (!farmer.inventory) return { decision: "decline", reason: "no-inventory" };
    const reserve =
      (farmer.desires?.data["minGoldReserve"] as number | undefined) ?? reserveDefault;
    const ref = CROP_SELL_PRICE[offer.crop];

    if (offer.direction === "sell") {
      // Peer is selling to us — we'd buy.
      if (offer.unitPrice > ref * buyCeiling) {
        return { decision: "decline", reason: "price-too-high" };
      }
      const cost = offer.unitPrice * offer.quantity;
      if (farmer.inventory.gold - cost < reserve) {
        return { decision: "decline", reason: "would-breach-reserve" };
      }
      return { decision: "accept" };
    }

    // direction === "buy" — peer wants to buy from us; we'd sell seeds.
    if (offer.unitPrice < ref * sellFloor) {
      return { decision: "decline", reason: "price-too-low" };
    }
    if (farmer.inventory.seeds[offer.crop] < offer.quantity + bufferSeeds) {
      return { decision: "decline", reason: bufferSeeds > 0 ? "would-deplete-buffer" : "no-stock" };
    }
    return { decision: "accept" };
  };
}
