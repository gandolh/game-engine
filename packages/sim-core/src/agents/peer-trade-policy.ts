// Shared factories for the peer-trade hooks. The four built-in personalities
// (aggressive, hoarder, opportunist, conservative) use an identical
// control-flow structure and differ only in a few numeric constants, so the
// logic is encoded here once.
//
// Two commodities (brief 59):
//   "seed" — priced against SEED_COST, transfers `inventory.seeds`. Farmers
//            rarely hold a seed surplus (they plant just-in-time), so seed
//            trades seldom close — kept for completeness + the hoarder's buy.
//   "crop" — priced against CROP_SELL_PRICE, transfers `inventory.crops`.
//            Harvested crops are the real surplus farmers sit on, so THIS is
//            the path that actually closes peer trades and feeds the trust
//            matrix.
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
    // Priced against the unit's SHOP reference — SEED_COST for seeds,
    // CROP_SELL_PRICE for crops. (Pre-brief-59 even seed trades used
    // CROP_SELL_PRICE, which put every "buy" floor far above any sane seed bid,
    // so every offer was declined "price-too-low".)
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

    // direction === "buy" — peer wants to buy from us; we'd sell our stock.
    if (offer.unitPrice < ref * sellFloor) {
      return { decision: "decline", reason: "price-too-low" };
    }
    if (held(farmer, commodity, offer.crop) < offer.quantity + bufferSeeds) {
      return { decision: "decline", reason: bufferSeeds > 0 ? "would-deplete-buffer" : "no-stock" };
    }
    return { decision: "accept" };
  };
}

// ---------------------------------------------------------------------------
// Shared initiate-peer-trade factory (brief 59)
// ---------------------------------------------------------------------------
//
// Gives each personality a deterministic, shop-anchored reason to start a
// trade. Two stances:
//
//   "sell-surplus" — if we hold a large surplus of `crop`, sell some down to
//                    peers slightly below shop (`priceMult` of the reference).
//                    A buyer accepts when priceMult <= their buyCeiling.
//   "buy-shortage" — if we're short on `crop` and can afford it, bid at
//                    `priceMult` of the reference. A seller accepts when
//                    priceMult >= their sellFloor.
//
// Prices are chosen so a fired offer lands inside the standard responder bands
// (sell floors 0.9–1.0, buy ceilings 0.95–1.1), so the handshake actually
// closes. The hook is consulted on every MEET (post-cooldown); returning null
// means "nothing worth proposing to this peer right now".

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

export function makeInitiatePeerTrade(cfg: InitiatePeerTradeCfg): InitiatePeerTradeFn {
  const { stance, crop, quantity, threshold, priceMult, reserveDefault } = cfg;
  const commodity: TradeCommodity = cfg.commodity ?? "seed";
  return (farmer, meet, ctx) => {
    if (!farmer.inventory || farmer.id === undefined) return null;
    const unitPrice = priceRef(commodity, crop) * priceMult;
    const have = held(farmer, commodity, crop);
    const day =
      (farmer.beliefs?.data["currentDay"] as number | undefined) ?? ctx.tick;
    const offerId = `peer-${farmer.id}-${meet.peerId}-${ctx.tick}-${day}-${crop}-${commodity}-${stance}`;

    if (stance === "sell-surplus") {
      // Sell only genuine surplus; never below `quantity` afterwards.
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
