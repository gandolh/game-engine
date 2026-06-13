

import type { GameEntity, CropKind } from "../components";
import type { InitiatePeerTradeFn, RespondPeerOfferFn } from "./peer-trade-registry";
import { SEED_COST, CROP_SELL_PRICE } from "../economy";

export type TradeCommodity = "seed" | "crop";

function priceRef(commodity: TradeCommodity, crop: CropKind): number {
  return commodity === "seed" ? SEED_COST[crop] : CROP_SELL_PRICE[crop];
}

function held(farmer: GameEntity, commodity: TradeCommodity, crop: CropKind): number {
  if (!farmer.inventory) return 0;
  return commodity === "seed" ? farmer.inventory.seeds[crop] : farmer.inventory.crops[crop];
}

export interface RespondPeerOfferCfg {

  buyCeiling: number;

  sellFloor: number;

  bufferSeeds: number;

  reserveDefault: number;

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

export interface InitiatePeerTradeCfg {
  stance: "sell-surplus" | "buy-shortage";

  crop: CropKind;

  quantity: number;

  threshold: number;

  priceMult: number;

  reserveDefault: number;

  commodity?: TradeCommodity;
}

export const MAX_FRIEND_DISCOUNT = 0.1;

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

    if (have >= threshold) return null;
    const reserve =
      (farmer.desires?.data["minGoldReserve"] as number | undefined) ?? reserveDefault;
    if (farmer.inventory.gold - unitPrice * quantity < reserve) return null;
    return { offerId, crop, quantity, unitPrice, direction: "buy" };
  };
}
