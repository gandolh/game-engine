import type { Intention, MessageBus } from "@engine/core";
import type { GameEntity, CropKind } from "../../../components";
import { TOOL_PRICE } from "../../../components";
import {
  PRODUCT_SELL_PRICE,
  FRUIT_SELL_PRICE,
  QUALITY_MULTIPLIER,
} from "../../../economy";
import { CROP_SELL_PRICE as SELL_PRICE } from "../../../economy";
import {
  PERFORMATIVE,
  ONT_MARKET,
  type PostOfferBody,
  type ReadOffersBody,
  type BuyRequestBody,
} from "../../../protocols";
import {
  ONT_SHOP,
  type ShopSellBody,
  type AuctionBidBody,
  type ResaleBeanBody,
} from "../../../protocols/shop";
import { MILL_PRICE, MILL_BATCH } from "../constants";
import type { ActingFarmer } from "../types";

function sendIntentMessage(
  bus: MessageBus,
  performative: string,
  ontology: string,
  senderId: number,
  recipientId: number | "broadcast",
  body: Record<string, unknown>,
  tick: number,
): void {
  bus.send(
    {
      performative,
      ontology,
      sender: senderId,
      recipient: recipientId,
      body: body as unknown as Record<string, unknown>,
    },
    tick,
  );
}

export function handleBuySeed(
  farmer: ActingFarmer,
  intent: Intention,
  bus: MessageBus | undefined,
  shopkeeperId: number | undefined,
  tick: number,
): void {
  if (!bus || shopkeeperId === undefined || farmer.id === undefined) return;
  const body: ShopSellBody = {
    item: "seed",
    crop: intent.data.crop as CropKind,
    quantity: (intent.data.quantity as number) ?? 1,
  };
  sendIntentMessage(
    bus,
    PERFORMATIVE.REQUEST,
    ONT_SHOP.SELL,
    farmer.id,
    shopkeeperId,
    body as unknown as Record<string, unknown>,
    tick,
  );
}

export function handleSellShopkeeper(
  farmer: ActingFarmer,
  intent: Intention,
): void {
  if (farmer.farmer?.currentRegion !== "village") return;
  const crop = intent.data.crop as CropKind;
  const qty = (intent.data.quantity as number) ?? 0;
  const available = Math.min(qty, farmer.inventory.crops[crop]);
  if (available <= 0) return;

  const basePrice = SELL_PRICE[crop];
  const quality = farmer.inventory.cropQuality;
  if (quality?.[crop]) {
    const q = quality[crop]!;
    let remaining = available;
    for (const [tier, mult] of [["gold", QUALITY_MULTIPLIER.gold], ["silver", QUALITY_MULTIPLIER.silver], ["normal", QUALITY_MULTIPLIER.normal]] as const) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, q[tier]);
      if (take > 0) {
        farmer.inventory.gold += Math.round(basePrice * mult * take);
        q[tier] -= take;
        remaining -= take;
      }
    }
    farmer.inventory.crops[crop] -= available;
  } else {
    farmer.inventory.crops[crop] -= available;
    farmer.inventory.gold += SELL_PRICE[crop] * available;
  }
}

export function handlePostOffer(
  farmer: ActingFarmer,
  intent: Intention,
  bus: MessageBus | undefined,
  marketWallId: number | undefined,
  tick: number,
): void {
  if (!bus || marketWallId === undefined || farmer.id === undefined) return;
  const body: PostOfferBody = {
    offer: {
      sellerId: farmer.id,
      crop: intent.data.crop as CropKind,
      quantity: intent.data.quantity as number,
      pricePerUnit: intent.data.pricePerUnit as number,
    },
  };
  sendIntentMessage(
    bus,
    PERFORMATIVE.INFORM,
    ONT_MARKET.POST_OFFER,
    farmer.id,
    marketWallId,
    body as unknown as Record<string, unknown>,
    tick,
  );
}

export function handleReadOffers(
  farmer: ActingFarmer,
  intent: Intention,
  bus: MessageBus | undefined,
  marketWallId: number | undefined,
  tick: number,
): void {
  if (!bus || marketWallId === undefined || farmer.id === undefined) return;
  const filter = intent.data.filter as ReadOffersBody["filter"] | undefined;
  const body: ReadOffersBody = filter === undefined ? {} : { filter };
  sendIntentMessage(
    bus,
    PERFORMATIVE.REQUEST,
    ONT_MARKET.READ_OFFERS,
    farmer.id,
    marketWallId,
    body as unknown as Record<string, unknown>,
    tick,
  );
}

export function handleBuyFromWall(
  farmer: ActingFarmer,
  intent: Intention,
  bus: MessageBus | undefined,
  marketWallId: number | undefined,
  tick: number,
): void {
  if (!bus || marketWallId === undefined || farmer.id === undefined) return;
  const body: BuyRequestBody = {
    offerId: intent.data.offerId as string,
    buyerId: farmer.id,
    pricePerUnit: intent.data.pricePerUnit as number,
    quantity: (intent.data.quantity as number) ?? 1,
  };
  sendIntentMessage(
    bus,
    PERFORMATIVE.PROPOSE,
    ONT_MARKET.BUY_REQUEST,
    farmer.id,
    marketWallId,
    body as unknown as Record<string, unknown>,
    tick,
  );
}

export function handleAuctionBid(
  farmer: ActingFarmer,
  intent: Intention,
  bus: MessageBus | undefined,
  shopkeeperId: number | undefined,
  tick: number,
): void {
  if (!bus || shopkeeperId === undefined || farmer.id === undefined) return;
  const body: AuctionBidBody = {
    auctionId: intent.data.auctionId as string,
    bidderId: farmer.id,
    amount: (intent.data.amount as number) ?? 0,
  };
  sendIntentMessage(
    bus,
    PERFORMATIVE.PROPOSE,
    ONT_SHOP.AUCTION_BID,
    farmer.id,
    shopkeeperId,
    body as unknown as Record<string, unknown>,
    tick,
  );
}

export function handleResaleBean(
  farmer: ActingFarmer,
  intent: Intention,
  bus: MessageBus | undefined,
  shopkeeperId: number | undefined,
  tick: number,
): void {
  if (!bus || shopkeeperId === undefined || farmer.id === undefined) return;
  const body: ResaleBeanBody = {
    quantity: (intent.data.quantity as number) ?? 1,
  };
  sendIntentMessage(
    bus,
    PERFORMATIVE.REQUEST,
    ONT_SHOP.RESALE_BEAN,
    farmer.id,
    shopkeeperId,
    body as unknown as Record<string, unknown>,
    tick,
  );
}

export function handleBuyTool(
  farmer: ActingFarmer,
  intent: Intention,
): void {
  if (farmer.farmer?.currentRegion !== "village") return;
  const toolKind = intent.data.toolKind as import("../../../components").ToolKind;
  const tier: import("../../../components").ToolTier = "wooden";
  const price = TOOL_PRICE[tier];
  if (farmer.inventory.gold < price) return;
  farmer.inventory.gold -= price;
  if (!farmer.inventory.tools) farmer.inventory.tools = [];
  farmer.inventory.tools.push({ kind: toolKind, tier, durability: 100 });
}

export function handleProcessCrop(
  farmer: ActingFarmer,
  intent: Intention,
): void {
  if (farmer.farmer?.currentRegion !== "mill") return; 
  const crop = intent.data.crop as CropKind;
  if (!(crop in MILL_PRICE)) return;
  const have = farmer.inventory.crops[crop];
  const taken = Math.min(MILL_BATCH, have);
  if (taken <= 0) return;
  farmer.inventory.crops[crop] -= taken;
  farmer.inventory.gold += MILL_PRICE[crop] * taken;
}

export function handleSellProduct(
  farmer: ActingFarmer,
  intent: Intention,
): void {
  if (farmer.farmer?.currentRegion !== "village") return;
  const productKind = intent.data.kind as import("../../../components").ProductKind;
  const q = farmer.inventory.products?.[productKind];
  if (!q) return;
  const base = PRODUCT_SELL_PRICE[productKind];
  const total = q.normal * base * QUALITY_MULTIPLIER.normal
    + q.silver * base * QUALITY_MULTIPLIER.silver
    + q.gold   * base * QUALITY_MULTIPLIER.gold;
  farmer.inventory.gold += Math.round(total);
  farmer.inventory.products![productKind] = { normal: 0, silver: 0, gold: 0 };
}

export function handleSellFruit(
  farmer: ActingFarmer,
  intent: Intention,
): void {
  if (farmer.farmer?.currentRegion !== "village") return;
  const fruitKind = intent.data.kind as import("../../../components").FruitKind;
  const q = farmer.inventory.fruit?.[fruitKind];
  if (!q) return;
  const base = FRUIT_SELL_PRICE[fruitKind];
  const total = q.normal * base * QUALITY_MULTIPLIER.normal
    + q.silver * base * QUALITY_MULTIPLIER.silver
    + q.gold   * base * QUALITY_MULTIPLIER.gold;
  farmer.inventory.gold += Math.round(total);
  farmer.inventory.fruit![fruitKind] = { normal: 0, silver: 0, gold: 0 };
}
