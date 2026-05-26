import type { SimContext, System, MessageBus, World, AgentMessage } from "@engine/core";
import type { GameEntity, CropKind } from "../components";
import {
  ONT_SHOP,
  type ShopBuyBody,
  type ShopSellBody,
  type ShopConfirmBody,
  type AuctionCfpBody,
} from "../protocols/shop";
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
 * ShopkeeperSystem — fixed-price BUY (farmer-sells-crops, unlimited liquidity)
 * + slate-driven SELL (shop-sells-seeds, limited daily stock per brief 08)
 * + periodic Golden-Bean auction trigger.
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
          this.handleSell(msg, ctx, shop);
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
    const slate = shop.shopkeeper?.dailySlate ?? [];
    // Matching offers: same crop, still have stock. `kind === "sell"` is
    // guaranteed by the slate generator post-brief-08 but the filter keeps
    // the handler robust if a future slate variant ever sneaks a non-sell
    // offer in.
    const matching: ShopOffer[] = slate.filter(
      (o) => o.kind === "sell" && o.crop === seedCrop && o.remaining > 0,
    );

    if (matching.length === 0) {
      this.replyConfirm(ctx.tick, sender, {
        ok: false,
        goldDelta: 0,
        itemDelta: { crop: seedCrop, quantity: 0 },
        reason: "no-matching-offer",
      });
      return;
    }

    const totalAvailable = matching.reduce((sum, o) => sum + o.remaining, 0);
    if (totalAvailable < qty) {
      this.replyConfirm(ctx.tick, sender, {
        ok: false,
        goldDelta: 0,
        itemDelta: { crop: seedCrop, quantity: 0 },
        reason: "insufficient-stock",
      });
      return;
    }

    // Cheapest-first. Array.sort is stable from ES2019, so equal-price
    // offers retain their slate-order tie-break — deterministic.
    const ordered = [...matching].sort((a, b) => a.unitPrice - b.unitPrice);
    const plan: Array<{ offer: ShopOffer; take: number }> = [];
    let qtyLeft = qty;
    let cost = 0;
    for (const offer of ordered) {
      if (qtyLeft <= 0) break;
      const take = Math.min(offer.remaining, qtyLeft);
      plan.push({ offer, take });
      cost += take * offer.unitPrice;
      qtyLeft -= take;
    }

    if (farmer.inventory.gold < cost) {
      this.replyConfirm(ctx.tick, sender, {
        ok: false,
        goldDelta: 0,
        itemDelta: { crop: seedCrop, quantity: 0 },
        reason: "insufficient-gold",
      });
      return;
    }

    // Commit phase — past this point, all checks have passed and we mutate.
    for (const { offer, take } of plan) {
      offer.remaining -= take;
    }
    farmer.inventory.gold -= cost;
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
