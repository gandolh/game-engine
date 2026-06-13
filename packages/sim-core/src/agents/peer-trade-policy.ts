// Two commodities:
//   "seed" — priced vs SEED_COST; seldom closes (farmers plant just-in-time, rarely hold surplus).
//   "crop" — priced vs CROP_SELL_PRICE; the path that actually closes trades and feeds trust.
import type { GameEntity, CropKind } from "../components";
import type { InitiatePeerTradeFn, RespondPeerOfferFn } from "./peer-trade-registry";
import { SEED_COST, CROP_SELL_PRICE } from "../economy";

export type TradeCommodity = "seed" | "crop";

/** Price reference per commodity: what a unit costs/sells for at the shop. */
function priceRef(commodity: TradeCommodity, crop: CropKind): number {
  return commodity === "seed" ? SEED_COST[crop] : CROP_SELL_PRICE[crop];
}

/** How many units of `crop` this farmer holds of the given commodity. */
function held(farmer: GameEntity, commodity: TradeCommodity, crop: CropKind): number {
  if (!farmer.inventory) return 0;
  return commodity === "seed" ? farmer.inventory.seeds[crop] : farmer.inventory.crops[crop];
}

export interface RespondPeerOfferCfg {
  /** Max multiple of the unit's shop reference we'll pay when buying. */
  buyCeiling: number;
  /** Min multiple of the unit's shop reference we require when selling. */
  sellFloor: number;
  /**
   * Units we keep in reserve beyond the quantity requested when selling.
   * Pass 0 for aggressive (no buffer) or a positive integer for personalities
   * that protect their stock.
   */
  bufferSeeds: number;
  /** Default minGoldReserve if the desires component has no value. */
  reserveDefault: number;
  /** Commodity this responder prices; defaults to "seed". */
  commodity?: TradeCommodity;
}

export function makeRespondPeerOffer(cfg: RespondPeerOfferCfg): RespondPeerOfferFn {
  const { buyCeiling, sellFloor, bufferSeeds, reserveDefault } = cfg;
  const commodity: TradeCommodity = cfg.commodity ?? "seed";
  return (farmer, offer, _sender, _ctx) => {
    if (!farmer.inventory) return { decision: "decline", reason: "no-inventory" };
    const reserve =
      (farmer.desires?.data["minGoldReserve"] as number | undefined) ?? reserveDefault;
    const ref = priceRef(commodity, offer.crop);

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

    if (offer.unitPrice < ref * sellFloor) {
      return { decision: "decline", reason: "price-too-low" };
    }
    if (held(farmer, commodity, offer.crop) < offer.quantity + bufferSeeds) {
      return { decision: "decline", reason: bufferSeeds > 0 ? "would-deplete-buffer" : "no-stock" };
    }
    return { decision: "accept" };
  };
}

// Two stances for initiating peer trades:
//   "sell-surplus": sell excess stock slightly below shop; buyer accepts when priceMult ≤ buyCeiling.
//   "buy-shortage": bid for missing stock; seller accepts when priceMult ≥ sellFloor.
// Prices are sized to land inside responder bands (sell floors 0.9–1.0, buy ceilings 0.95–1.1).

export interface InitiatePeerTradeCfg {
  stance: "sell-surplus" | "buy-shortage";
  /** Crop the personality trades in. */
  crop: CropKind;
  /** Units per offer. */
  quantity: number;
  /**
   * sell-surplus: only initiate when we hold at least this many of `crop` (so a
   *               trade leaves us comfortable). Sold qty never dips us below
   *               `quantity`.
   * buy-shortage: only initiate when we hold STRICTLY FEWER than this many.
   */
  threshold: number;
  /** Price multiple of the commodity reference. sell: ~0.95; buy: ~1.0. */
  priceMult: number;
  /** Default minGoldReserve if desires has none (buy-shortage only). */
  reserveDefault: number;
  /** Commodity to trade; defaults to "seed". */
  commodity?: TradeCommodity;
}

/** Max fraction shaved off a friend's sell price at full trust (1.0). Baseline 0.5 → no discount. */
export const MAX_FRIEND_DISCOUNT = 0.1;

/**
 * Friend discount on the SELLER's unit price, scaled by the initiator's directional
 * trust toward the peer. trust 0.5 (stranger) → 0×; trust 1.0 → MAX_FRIEND_DISCOUNT.
 * Below baseline (a rival we'd still trade with) gets no surcharge — just no discount.
 * Pure read of `trust`, so deterministic.
 */
function friendSellMultiplier(farmer: GameEntity, peerId: number): number {
  const trust = farmer.trust?.byId.get(peerId) ?? 0.5;
  const t = Math.max(0, Math.min(1, (trust - 0.5) / 0.5));
  return 1 - t * MAX_FRIEND_DISCOUNT;
}

export function makeInitiatePeerTrade(cfg: InitiatePeerTradeCfg): InitiatePeerTradeFn {
  const { stance, crop, quantity, threshold, priceMult, reserveDefault } = cfg;
  const commodity: TradeCommodity = cfg.commodity ?? "seed";
  return (farmer, meet, ctx) => {
    if (!farmer.inventory || farmer.id === undefined) return null;
    // Sellers gift friends a trust-scaled discount; buy-shortage bids are unchanged.
    const discountMult = stance === "sell-surplus" ? friendSellMultiplier(farmer, meet.peerId) : 1;
    const unitPrice = priceRef(commodity, crop) * priceMult * discountMult;
    const have = held(farmer, commodity, crop);
    const day =
      (farmer.beliefs?.data["currentDay"] as number | undefined) ?? ctx.tick;
    const offerId = `peer-${farmer.id}-${meet.peerId}-${ctx.tick}-${day}-${crop}-${commodity}-${stance}`;

    if (stance === "sell-surplus") {
      if (have < threshold) return null;
      if (have - quantity < quantity) return null;
      return { offerId, crop, quantity, unitPrice, direction: "sell" };
    }

    // buy-shortage
    if (have >= threshold) return null;
    const reserve =
      (farmer.desires?.data["minGoldReserve"] as number | undefined) ?? reserveDefault;
    if (farmer.inventory.gold - unitPrice * quantity < reserve) return null;
    return { offerId, crop, quantity, unitPrice, direction: "buy" };
  };
}
