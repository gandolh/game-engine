import type { SimContext, System, MessageBus, World, AgentMessage } from "@engine/core";
import type { GameEntity, CropKind } from "../components";
import {
  ONT_SHOP,
  type ShopBuyBody,
  type ShopSellBody,
  type ShopConfirmBody,
  type AuctionCfpBody,
} from "../protocols/shop";
import { PERFORMATIVE } from "../protocols/performatives";
import type { AuctionSystem } from "./auction";

/** Price the shopkeeper PAYS to buy crops from farmers. */
const SHOP_BUY_PRICE: Record<CropKind, number> = {
  radish: 5,
  wheat: 8,
  pumpkin: 22,
};

/** Price the shopkeeper CHARGES to sell seeds to farmers. */
const SHOP_SEED_PRICE: Record<string, number> = {
  radish: 5,
  wheat: 10,
  pumpkin: 20,
  golden_bean: 999, // auction-only item — sell-as-seed is rejected.
};

const AUCTION_TRIGGER_INTERVAL_DAYS = 5;
const AUCTION_RESERVE_PRICE = 50;
const AUCTION_DURATION_TICKS = 20;

export interface ShopkeeperSystemOptions {
  /** How often (in days) the shopkeeper opens a Golden-Bean auction. */
  auctionEveryDays?: number;
  /** Reserve price for the periodic Golden-Bean auction. */
  auctionReservePrice?: number;
  /** Duration (in ticks) between CFP and close. */
  auctionDurationTicks?: number;
}

/**
 * ShopkeeperSystem — fixed-price BUY/SELL counter + periodic Golden-Bean
 * auction trigger.
 *
 * Inventory-mutation choice: **single-step direct mutation**. When a farmer
 * sends ONT_SHOP.BUY / SELL via the bus, this system mutates the farmer's
 * inventory and gold directly, then replies with CONFIRM as an audit
 * record. (The MD spec calls this the "simplest" path and recommends
 * documenting; alternative would be two-step where the farmer's perceive
 * consumes the CONFIRM and applies the delta. Single-step matches the
 * existing `ActSystem`'s local-intention path mental model.)
 *
 * Auction trigger choice: lives here (not in AuctionSystem). The shopkeeper
 * is the auctioneer of record; AuctionSystem is a pure state machine. We
 * both:
 *   1. broadcast `ONT_SHOP.AUCTION_CFP` on the bus (so farmer inboxes see
 *      it via InboxDispatchSystem), and
 *   2. call `auctionSystem.openAuction(cfp)` directly so the state machine
 *      doesn't depend on the bus subscribe path (which the production loop
 *      doesn't wire up — see `InboxDispatchSystem`).
 */
export class ShopkeeperSystem implements System {
  readonly name = "ShopkeeperSystem";

  private lastAuctionDay = -Infinity;
  private auctionSeq = 0;

  private readonly auctionEveryDays: number;
  private readonly auctionReservePrice: number;
  private readonly auctionDurationTicks: number;

  constructor(
    private readonly bus: MessageBus,
    private readonly world: World<GameEntity>,
    private readonly auctionSystem: AuctionSystem,
    options: ShopkeeperSystemOptions = {},
  ) {
    this.auctionEveryDays = options.auctionEveryDays ?? AUCTION_TRIGGER_INTERVAL_DAYS;
    this.auctionReservePrice = options.auctionReservePrice ?? AUCTION_RESERVE_PRICE;
    this.auctionDurationTicks = options.auctionDurationTicks ?? AUCTION_DURATION_TICKS;
  }

  run(ctx: SimContext): void {
    const shop = this.findShop();
    if (!shop || !shop.inbox) return;

    // 1. Process inbox — but only ontologies this system owns. AuctionSystem
    //    drains the same inbox in its own pass for AUCTION_BID etc.
    const remaining: AgentMessage[] = [];
    for (const msg of shop.inbox.messages) {
      switch (msg.ontology) {
        case ONT_SHOP.BUY:
          this.handleBuy(msg, ctx);
          break;
        case ONT_SHOP.SELL:
          this.handleSell(msg, ctx);
          break;
        default:
          remaining.push(msg);
          break;
      }
    }
    shop.inbox.messages = remaining;

    // 2. Periodic auction trigger (in days, not ticks). We observe `currentDay`
    //    from any farmer's beliefs; if none available, fall back to no-trigger.
    const day = this.readCurrentDay();
    if (day !== undefined && day - this.lastAuctionDay >= this.auctionEveryDays) {
      this.triggerAuction(ctx, day);
      this.lastAuctionDay = day;
    }
  }

  // ---- handlers ----------------------------------------------------------

  private handleBuy(msg: AgentMessage, ctx: SimContext): void {
    const body = msg.body as Partial<ShopBuyBody>;
    if (msg.sender === "world") return;
    const sender = msg.sender;
    const farmer = this.findFarmerById(sender);
    if (!farmer || !farmer.inventory) return;

    const crop = body.crop as CropKind | undefined;
    const qty = body.quantity ?? 0;
    if (!crop || qty <= 0 || !(crop in SHOP_BUY_PRICE)) {
      this.replyConfirm(ctx.tick, sender, {
        ok: false,
        goldDelta: 0,
        itemDelta: { crop: (crop ?? "radish") as CropKind, quantity: 0 },
        reason: "invalid-buy-request",
      });
      return;
    }

    const have = farmer.inventory.crops[crop];
    const taken = Math.min(qty, have);
    if (taken <= 0) {
      this.replyConfirm(ctx.tick, sender, {
        ok: false,
        goldDelta: 0,
        itemDelta: { crop, quantity: 0 },
        reason: "no-inventory",
      });
      return;
    }

    const goldDelta = SHOP_BUY_PRICE[crop] * taken;
    farmer.inventory.crops[crop] -= taken;
    farmer.inventory.gold += goldDelta;

    this.replyConfirm(ctx.tick, sender, {
      ok: true,
      goldDelta,
      itemDelta: { crop, quantity: -taken },
    });
  }

  private handleSell(msg: AgentMessage, ctx: SimContext): void {
    const body = msg.body as Partial<ShopSellBody>;
    if (msg.sender === "world") return;
    const sender = msg.sender;
    const farmer = this.findFarmerById(sender);
    if (!farmer || !farmer.inventory) return;

    const crop = body.crop as string | undefined;
    const qty = body.quantity ?? 0;
    if (!crop || qty <= 0 || body.item !== "seed") {
      this.replyConfirm(ctx.tick, sender, {
        ok: false,
        goldDelta: 0,
        itemDelta: { crop: "radish", quantity: 0 },
        reason: "invalid-sell-request",
      });
      return;
    }
    if (crop === "golden_bean") {
      this.replyConfirm(ctx.tick, sender, {
        ok: false,
        goldDelta: 0,
        itemDelta: { crop: "radish", quantity: 0 },
        reason: "golden-bean-auction-only",
      });
      return;
    }
    if (!(crop in SHOP_SEED_PRICE)) {
      this.replyConfirm(ctx.tick, sender, {
        ok: false,
        goldDelta: 0,
        itemDelta: { crop: "radish", quantity: 0 },
        reason: "unknown-seed",
      });
      return;
    }

    const cost = SHOP_SEED_PRICE[crop]! * qty;
    if (farmer.inventory.gold < cost) {
      this.replyConfirm(ctx.tick, sender, {
        ok: false,
        goldDelta: 0,
        itemDelta: { crop: crop as CropKind, quantity: 0 },
        reason: "insufficient-gold",
      });
      return;
    }

    farmer.inventory.gold -= cost;
    const seedCrop = crop as CropKind;
    farmer.inventory.seeds[seedCrop] += qty;

    this.replyConfirm(ctx.tick, sender, {
      ok: true,
      goldDelta: -cost,
      itemDelta: { crop: seedCrop, quantity: qty },
    });
  }

  // ---- auction trigger ---------------------------------------------------

  private triggerAuction(ctx: SimContext, _day: number): void {
    const auctionId = `gb-${this.auctionSeq++}`;
    const cfp: AuctionCfpBody = {
      auctionId,
      type: "vickrey",
      item: "golden_bean",
      reservePrice: this.auctionReservePrice,
      closesAtTick: ctx.tick + this.auctionDurationTicks,
    };
    // (1) Broadcast on the bus so farmer inboxes hear it.
    this.bus.send(
      {
        performative: PERFORMATIVE.CFP,
        ontology: ONT_SHOP.AUCTION_CFP,
        sender: "world",
        recipient: "broadcast",
        body: cfp as unknown as Record<string, unknown>,
      },
      ctx.tick,
    );
    // (2) Register with the AuctionSystem directly.
    this.auctionSystem.openAuction(cfp);
  }

  // ---- helpers -----------------------------------------------------------

  private replyConfirm(tick: number, to: number, body: ShopConfirmBody): void {
    this.bus.send(
      {
        performative: body.ok ? PERFORMATIVE.INFORM : PERFORMATIVE.FAILURE,
        ontology: ONT_SHOP.CONFIRM,
        sender: "world",
        recipient: to,
        body: body as unknown as Record<string, unknown>,
      },
      tick,
    );
  }

  private findShop(): GameEntity | undefined {
    for (const e of this.world.query("shopkeeper", "inbox")) return e;
    return undefined;
  }

  private findFarmerById(id: number): GameEntity | undefined {
    for (const f of this.world.query("farmer", "inventory")) {
      if (f.id === id) return f;
    }
    return undefined;
  }

  private readCurrentDay(): number | undefined {
    for (const f of this.world.query("farmer", "beliefs")) {
      const d = f.beliefs?.data.currentDay;
      if (typeof d === "number") return d;
    }
    return undefined;
  }
}
