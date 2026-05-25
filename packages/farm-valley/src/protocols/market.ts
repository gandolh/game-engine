import type { CropKind } from "../components";

export const ONT_MARKET = {
  POST_OFFER: "post-offer",
  READ_OFFERS: "read-offers",
  OFFERS_LIST: "offers-list",
  CANCEL_OFFER: "cancel-offer",
  TRADE_COMPLETED: "trade-completed",
  BUY_REQUEST: "buy-request",
  TRADE_ACCEPT: "trade-accept",
  TRADE_REJECT: "trade-reject",
  COUNTER_OFFER: "counter-offer",
} as const;

export type MarketOntology = (typeof ONT_MARKET)[keyof typeof ONT_MARKET];

export interface MarketOffer {
  offerId: string;
  sellerId: number;
  crop: CropKind;
  quantity: number;
  pricePerUnit: number;
  postedDay: number;
}

export interface PostOfferBody {
  offer: Omit<MarketOffer, "offerId" | "postedDay">;
}

export interface ReadOffersBody {
  filter?: { crop?: CropKind };
}

export interface OffersListBody {
  offers: MarketOffer[];
}

export interface CancelOfferBody {
  offerId: string;
}

export interface BuyRequestBody {
  offerId: string;
  buyerId: number;
  pricePerUnit: number;
  quantity: number;
}

export interface TradeAcceptBody {
  offerId: string;
}

export interface TradeRejectBody {
  offerId: string;
  reason: string;
}
