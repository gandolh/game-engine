import type { SimContext, System, MessageBus, World, AgentMessage } from "@engine/core";
import type { GameEntity, CropKind } from "../components";
import { firstEntity, findById } from "./entity-helpers";
import {
  ONT_SHOP,
  type ShopBuyBody,
  type ShopSellBody,
  type ShopConfirmBody,
  type AuctionCfpBody,
  type AuctionResultBody,
  type ResaleBeanBody,
} from "../protocols/shop";
import { consumeFromSlate } from "../agents/shop-slate";
import type { ShopOffer } from "../agents/shop-slate";
import { PERFORMATIVE } from "../protocols/performatives";
import type { AuctionSystem } from "./auction";

/** Price the shopkeeper PAYS to buy crops from farmers. */
const SHOP_BUY_PRICE: Record<CropKind, number> = {
  radish: 5,
  wheat: 8,
  pumpkin: 22,
};

/**
 * Seeds the shop knows how to sell at all. The actual unit price now comes
 * from the daily slate (`ShopkeeperSystem.handleSell`); this set just gates
 * "unknown seed" before the slate lookup so unknown crops still get the
 * informative rejection reason rather than `no-matching-offer`.
 *
 * `golden_bean` is intentionally excluded — it's auction-only — and gets its
 * own dedicated rejection branch before this check.
 */
const SELLABLE_SEED_CROPS: ReadonlySet<string> = new Set<string>([
  "radish",
  "wheat",
  "pumpkin",
]);

const AUCTION_TRIGGER_INTERVAL_DAYS = 5;
const AUCTION_RESERVE_PRICE = 50;
/**
 * brief 24 — an auction must stay open ACROSS the next day boundary so farmers
 * (who only deliberate on day-start) get a deliberation cycle to bid while the
 * CFP is in their beliefs. At 20 ticks/day, 25 ticks means: open on day N's
 * boundary, farmers bid on day N+1's boundary, resolve mid-day N+1. The old
 * 20-tick duration closed exactly as the next day began, so nobody ever bid.
 */
const AUCTION_DURATION_TICKS = 25;

/**
 * brief 24 — the shop buys a won golden bean back at a fat premium over the
 * auction reserve, so winning + reselling is genuinely profitable and the
 * "like gold" framing holds. Resale price = reserve × this multiplier.
 */
const GOLDEN_BEAN_RESALE_MULTIPLIER = 3;

export interface ShopkeeperSystemOptions {
  /** How often (in days) the shopkeeper opens a Golden-Bean auction. */
  auctionEveryDays?: number;
  /** Reserve price for the periodic Golden-Bean auction. */
  auctionReservePrice?: number;
  /** Duration (in ticks) between CFP and close. */
  auctionDurationTicks?: number;
}

/**
 * ShopkeeperSystem — fixed-price BUY (farmer-sells-crops, unlimited liquidity)
 * + slate-driven SELL (shop-sells-seeds, limited daily stock per brief 08)
 * + periodic Golden-Bean auction trigger.
 *
 * Inventory-mutation choice: **single-step direct mutation**. When a farmer
 * sends ONT_SHOP.BUY / SELL via the bus, this system mutates the farmer's
 * inventory and gold directly, then replies with CONFIRM as an audit
 * record. (The MD spec calls this the "simplest" path and recommends
 * documenting; alternative would be two-step where the farmer's perceive
 * consumes the CONFIRM and applies the delta.)
 *
 * All seed purchases route here: `ActSystem`'s `buy-seed` intent now emits an
 * `ONT_SHOP.SELL` (item: "seed") message instead of mutating the slate inline,
 * so `handleSell` is the single owner of slate consumption + gold checks.
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
  /** brief 24 — auctionIds already settled (winner credited), for idempotency. */
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

    // 1. Process inbox — but only ontologies this system owns. AuctionSystem
    //    drains the same inbox in its own pass for AUCTION_BID etc.
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
        case ONT_SHOP.AUCTION_RESULT:
          // The shop is the auctioneer of record: when an auction it opened
          // resolves, credit the winner their bean and charge the paid price.
          // Snoop-only (we don't consume — the result is a broadcast the event
          // feed also reads), so re-push it for other observers.
          this.creditAuctionWinner(msg);
          remaining.push(msg);
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

    // Apply the notice-board bounty premium when today's wanted crop matches.
    const bountyMult = this.bountyMultiplierFor(crop);
    const goldDelta = Math.round(SHOP_BUY_PRICE[crop] * bountyMult) * taken;
    farmer.inventory.crops[crop] -= taken;
    farmer.inventory.gold += goldDelta;

    this.replyConfirm(ctx.tick, sender, {
      ok: true,
      goldDelta,
      itemDelta: { crop, quantity: -taken },
    });
  }

  /**
   * The active notice-board bounty multiplier for `crop` (1 when none/mismatch).
   * The bounty is surfaced into farmer beliefs by PerceiveSystem from the
   * NoticeBoardSystem broadcast; it's the same value for every farmer, so we
   * read the first available one.
   */
  private bountyMultiplierFor(crop: CropKind): number {
    for (const f of this.world.query("farmer", "beliefs")) {
      const b = f.beliefs?.data.bounty as { crop: CropKind; multiplier: number } | undefined;
      if (b) return b.crop === crop ? b.multiplier : 1;
    }
    return 1;
  }

  /**
   * brief 24 — when an auction this shop opened resolves with a winner, credit
   * the winner one golden bean and charge them the price they owe. The
   * AuctionSystem only announces the outcome; the shop (auctioneer of record)
   * performs settlement. Idempotent per (auctionId): an auction resolves once.
   */
  private creditAuctionWinner(msg: AgentMessage): void {
    const body = msg.body as Partial<AuctionResultBody>;
    if (body.winnerId === null || body.winnerId === undefined) return;
    if (this.settledAuctions.has(body.auctionId ?? "")) return;
    const winner = findById(this.world, body.winnerId, "farmer", "inventory");
    if (!winner || !winner.inventory) return;
    const paid = body.paidPrice ?? 0;
    // Don't let settlement drive a farmer negative; if they somehow can't
    // cover it, skip the credit (the bid logic gates on affordability anyway).
    if (winner.inventory.gold < paid) return;
    winner.inventory.gold -= paid;
    winner.inventory.goldenBeans = (winner.inventory.goldenBeans ?? 0) + 1;
    this.settledAuctions.add(body.auctionId ?? "");
  }

  /**
   * brief 24 — golden-bean resale: a farmer sells won beans back to the shop at
   * a premium over the auction reserve, realizing the "like gold" value.
   */
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

  /**
   * Slate-driven seed sale (shop → farmer). Brief 08 replaced the legacy
   * fixed-price `SHOP_SEED_PRICE` lookup with a daily-slate lookup:
   *
   *   1. Input validation + golden-bean ban (same as before).
   *   2. Reject unknown seeds with `unknown-seed` before slate lookup so the
   *      reason stays informative.
   *   3. Filter the shop's `dailySlate` for offers matching crop with stock.
   *   4. If no matching offers at all → FAILURE `no-matching-offer`.
   *   5. If cumulative `remaining` across matching offers < qty → FAILURE
   *      `insufficient-stock`. No mutation either way (atomic check).
   *   6. Walk matching offers cheapest-first, planning deductions. The
   *      decision to consume across multiple matching offers (rather than
   *      "one offer per request") favors the farmer in this single-shop
   *      economy and is documented in `08-shop-slate-sales-plan.md`.
   *   7. Check farmer gold against the total cost. FAILURE on shortfall —
   *      still no offer mutation yet (atomic).
   *   8. Commit: decrement each touched offer's `remaining`, deduct gold,
   *      credit seeds, reply CONFIRM with `goldDelta = -cost`.
   *
   * Note on readonly: `shop.shopkeeper.dailySlate` is typed `readonly
   * ShopOffer[]` — the array slot is readonly (no reassignment), but each
   * offer's `remaining: number` is a writable field, so the per-offer
   * mutation here is type-safe.
   */
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
    // Cast: dailySlate is typed readonly but per-offer fields are mutable.
    const slate = shop.shopkeeper?.dailySlate as ShopOffer[] | undefined;

    // 1. Dry-run to compute total cost without mutating slate.
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

    // 2. Gold check before committing slate.
    if (farmer.inventory.gold < dry.totalCost) {
      this.replyConfirm(ctx.tick, sender, {
        ok: false,
        goldDelta: 0,
        itemDelta: { crop: seedCrop, quantity: 0 },
        reason: "insufficient-gold",
      });
      return;
    }

    // 3. Commit — decrement slate, deduct gold, credit seeds.
    const consume = consumeFromSlate(slate, seedCrop, qty);
    // consume.ok must be true here (same slate, no external mutation between steps).
    if (!consume.ok || consume.totalCost === undefined) {
      // Defensive: shouldn't happen, but bail cleanly.
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

  private readCurrentDay(): number | undefined {
    for (const f of this.world.query("farmer", "beliefs")) {
      const d = f.beliefs?.data.currentDay;
      if (typeof d === "number") return d;
    }
    return undefined;
  }
}
