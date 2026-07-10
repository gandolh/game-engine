import type { SimContext, System, MessageBus, World, AgentMessage } from "@engine/core";
import type { GameEntity, CropKind } from "../../components";
import { firstEntity, findById } from "../entity-helpers";
import {
  ONT_SHOP,
  type ShopBuyBody,
  type ShopSellBody,
  type ShopConfirmBody,
  type AuctionCfpBody,
  type AuctionResultBody,
  type ResaleBeanBody,
} from "../../protocols/shop";
import { consumeFromSlate } from "../../agents/shop-slate";
import type { ShopOffer } from "../../agents/shop-slate";
import { PERFORMATIVE } from "../../protocols/performatives";
import { debitCrop } from "../../economy";
import type { AuctionSystem } from "../auction";
import {
  SHOP_BUY_PRICE,
  SELLABLE_SEED_CROPS,
  AUCTION_TRIGGER_INTERVAL_DAYS,
  AUCTION_RESERVE_PRICE,
  AUCTION_DURATION_TICKS,
  GOLDEN_BEAN_RESALE_MULTIPLIER,
} from "./constants";

export interface ShopkeeperSystemOptions {

  auctionEveryDays?: number;

  auctionReservePrice?: number;

  auctionDurationTicks?: number;
}

export class ShopkeeperSystem implements System {
  readonly name = "ShopkeeperSystem";

  private lastAuctionDay = -Infinity;
  private auctionSeq = 0;
  private readonly settledAuctions = new Set<string>();

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
    const shop = firstEntity(this.world, "shopkeeper", "inbox");
    if (!shop || !shop.inbox) return;

    const remaining: AgentMessage[] = [];
    for (const msg of shop.inbox.messages) {
      switch (msg.ontology) {
        case ONT_SHOP.BUY:
          this.handleBuy(msg, ctx);
          break;
        case ONT_SHOP.SELL:
          this.handleSell(msg, ctx, shop);
          break;
        case ONT_SHOP.RESALE_BEAN:
          this.handleResaleBean(msg, ctx);
          break;
        case ONT_SHOP.AUCTION_RESULT: {
          this.creditAuctionWinner(msg);
          // Retain only while settlement is still pending: a winner exists but
          // has not yet been credited (the retry waits for their funds across
          // ticks). Settled results and no-winner results are inert — dropping
          // them is behaviour-preserving (creditAuctionWinner short-circuits on
          // both) and keeps the shopkeeper inbox bounded.
          const res = msg.body as Partial<AuctionResultBody>;
          const auctionId = res.auctionId ?? "";
          const hasWinner = res.winnerId !== null && res.winnerId !== undefined;
          if (hasWinner && !this.settledAuctions.has(auctionId)) {
            remaining.push(msg);
          }
          break;
        }
        default:
          remaining.push(msg);
          break;
      }
    }
    shop.inbox.messages = remaining;

    const day = this.readCurrentDay();
    if (day !== undefined && day - this.lastAuctionDay >= this.auctionEveryDays) {
      this.triggerAuction(ctx, day);
      this.lastAuctionDay = day;
    }
  }

  private handleBuy(msg: AgentMessage, ctx: SimContext): void {
    const body = msg.body as Partial<ShopBuyBody>;
    if (msg.sender === "world") return;
    const sender = msg.sender;
    const farmer = findById(this.world, sender, "farmer", "inventory");
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

    const bountyMult = this.bountyMultiplierFor(crop);
    const goldDelta = Math.round(SHOP_BUY_PRICE[crop] * bountyMult) * taken;
    debitCrop(farmer.inventory, crop, taken);
    farmer.inventory.gold += goldDelta;

    this.replyConfirm(ctx.tick, sender, {
      ok: true,
      goldDelta,
      itemDelta: { crop, quantity: -taken },
    });
  }

  private bountyMultiplierFor(crop: CropKind): number {
    for (const f of this.world.query("farmer", "beliefs")) {
      const b = f.beliefs?.data.bounty as { crop: CropKind; multiplier: number } | undefined;
      if (b) {
        if (b.crop !== crop) return 1;

        if (typeof b.multiplier === "number") return b.multiplier;
        return 1;
      }
    }
    return 1;
  }

  private creditAuctionWinner(msg: AgentMessage): void {
    const body = msg.body as Partial<AuctionResultBody>;
    if (body.winnerId === null || body.winnerId === undefined) return;
    if (this.settledAuctions.has(body.auctionId ?? "")) return;
    const winner = findById(this.world, body.winnerId, "farmer", "inventory");
    if (!winner || !winner.inventory) return;
    const paid = body.paidPrice ?? 0;
    if (winner.inventory.gold < paid) return;
    winner.inventory.gold -= paid;
    winner.inventory.goldenBeans = (winner.inventory.goldenBeans ?? 0) + 1;
    this.settledAuctions.add(body.auctionId ?? "");
  }

  private handleResaleBean(msg: AgentMessage, ctx: SimContext): void {
    if (msg.sender === "world") return;
    const sender = msg.sender;
    const farmer = findById(this.world, sender, "farmer", "inventory");
    if (!farmer || !farmer.inventory) return;
    const body = msg.body as Partial<ResaleBeanBody>;
    const qty = body.quantity ?? 0;
    const have = farmer.inventory.goldenBeans ?? 0;
    const taken = Math.min(qty, have);
    if (taken <= 0) {
      this.replyConfirm(ctx.tick, sender, {
        ok: false,
        goldDelta: 0,
        itemDelta: { crop: "radish", quantity: 0 },
        reason: "no-golden-bean",
      });
      return;
    }
    const unit = this.auctionReservePrice * GOLDEN_BEAN_RESALE_MULTIPLIER;
    const goldDelta = unit * taken;
    farmer.inventory.goldenBeans = have - taken;
    farmer.inventory.gold += goldDelta;
    this.replyConfirm(ctx.tick, sender, {
      ok: true,
      goldDelta,
      itemDelta: { crop: "radish", quantity: 0 },
      reason: "golden-bean-resold",
    });
  }

  private handleSell(msg: AgentMessage, ctx: SimContext, shop: GameEntity): void {
    const body = msg.body as Partial<ShopSellBody>;
    if (msg.sender === "world") return;
    const sender = msg.sender;
    const farmer = findById(this.world, sender, "farmer", "inventory");
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
    if (!SELLABLE_SEED_CROPS.has(crop)) {
      this.replyConfirm(ctx.tick, sender, {
        ok: false,
        goldDelta: 0,
        itemDelta: { crop: "radish", quantity: 0 },
        reason: "unknown-seed",
      });
      return;
    }

    const seedCrop = crop as CropKind;
    const slate = shop.shopkeeper?.dailySlate as ShopOffer[] | undefined;

    const dry = consumeFromSlate(slate, seedCrop, qty, { dryRun: true });
    if (!dry.ok || dry.totalCost === undefined) {
      this.replyConfirm(ctx.tick, sender, {
        ok: false,
        goldDelta: 0,
        itemDelta: { crop: seedCrop, quantity: 0 },
        reason: dry.reason ?? "no-matching-offer",
      });
      return;
    }

    if (farmer.inventory.gold < dry.totalCost) {
      this.replyConfirm(ctx.tick, sender, {
        ok: false,
        goldDelta: 0,
        itemDelta: { crop: seedCrop, quantity: 0 },
        reason: "insufficient-gold",
      });
      return;
    }

    const consume = consumeFromSlate(slate, seedCrop, qty);
    if (!consume.ok || consume.totalCost === undefined) {
      this.replyConfirm(ctx.tick, sender, {
        ok: false,
        goldDelta: 0,
        itemDelta: { crop: seedCrop, quantity: 0 },
        reason: "insufficient-stock",
      });
      return;
    }
    farmer.inventory.gold -= consume.totalCost;
    farmer.inventory.seeds[seedCrop] += qty;

    this.replyConfirm(ctx.tick, sender, {
      ok: true,
      goldDelta: -consume.totalCost,
      itemDelta: { crop: seedCrop, quantity: qty },
    });
  }

  private triggerAuction(ctx: SimContext, _day: number): void {
    const auctionId = `gb-${this.auctionSeq++}`;
    const cfp: AuctionCfpBody = {
      auctionId,
      type: "vickrey",
      item: "golden_bean",
      reservePrice: this.auctionReservePrice,
      closesAtTick: ctx.tick + this.auctionDurationTicks,
    };
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
    this.auctionSystem.openAuction(cfp);
  }

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

  private readCurrentDay(): number | undefined {
    for (const f of this.world.query("farmer", "beliefs")) {
      const d = f.beliefs?.data.currentDay;
      if (typeof d === "number") return d;
    }
    return undefined;
  }
}
