import type { CropKind } from "../components";

export const ONT_SHOP = {
  BUY: "shop-buy",
  SELL: "shop-sell",
  CONFIRM: "shop-confirm",
  AUCTION_CFP: "auction-cfp",
  AUCTION_BID: "auction-bid",
  AUCTION_RESULT: "auction-result",
  DAILY_SLATE: "shop.daily-slate",
} as const;

export type ShopOntology = (typeof ONT_SHOP)[keyof typeof ONT_SHOP];

export type AuctionType = "vickrey" | "dutch" | "english" | "fpsb";

export interface ShopBuyBody {
  crop: CropKind;
  quantity: number;
}

export interface ShopSellBody {
  item: "seed";
  crop: CropKind;
  quantity: number;
}

export interface ShopConfirmBody {
  ok: boolean;
  goldDelta: number;
  itemDelta: { crop: CropKind; quantity: number };
  reason?: string;
}

export interface AuctionCfpBody {
  auctionId: string;
  type: AuctionType;
  item: string;
  reservePrice: number;
  closesAtTick: number;
}

export interface AuctionBidBody {
  auctionId: string;
  bidderId: number;
  amount: number;
}

export interface AuctionResultBody {
  auctionId: string;
  winnerId: number | null;
  paidPrice: number;
  participants: number[];
}

export interface DailySlateBody {
  offers: import("../agents/shop-slate").ShopOffer[];
}
