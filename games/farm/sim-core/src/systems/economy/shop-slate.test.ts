import { describe, it, expect, beforeEach } from "vitest";
import { World, MessageBus, createRng } from "@engine/core";
import type { GameEntity } from "../../components";
import { spawnShopkeeper } from "../../agents/market-wall";
import { ShopSlateSystem } from "./shop-slate";
import { ONT_SHOP } from "../../protocols/shop";
import { ONT_SIMULATION, PERFORMATIVE } from "../../protocols";
import { SLATE_SIZE } from "../../agents/shop-slate";

function makeCtx(tick = 0) {
  return { tick, deltaMs: 16, totalMs: tick * 16 };
}

function sendDayStartToShop(shop: GameEntity, day: number): void {
  shop.inbox!.messages.push({
    performative: PERFORMATIVE.INFORM,
    ontology: ONT_SIMULATION.DAY_START,
    sender: "world",
    body: { day },
    tickIssued: 0,
  });
}

describe("ShopSlateSystem", () => {
  let world: World<GameEntity>;
  let bus: MessageBus;
  let shop: GameEntity;
  let system: ShopSlateSystem;

  beforeEach(() => {
    world = new World<GameEntity>();
    bus = new MessageBus();
    shop = spawnShopkeeper(world);
    system = new ShopSlateSystem(world, bus, createRng(42));
  });

  it("does nothing on a tick with no DAY_START message", () => {
    system.run(makeCtx(0));
    bus.flush();
    expect(bus.drain().length).toBe(0);
    expect(shop.shopkeeper!.dailySlate).toBeUndefined();
  });

  it("populates shopkeeper.dailySlate on day-start", () => {
    sendDayStartToShop(shop, 1);
    system.run(makeCtx(10));

    expect(shop.shopkeeper!.dailySlate).toBeDefined();
    expect(shop.shopkeeper!.dailySlate!.length).toBe(SLATE_SIZE);
  });

  it("emits ONT_SHOP.DAILY_SLATE on the bus on day-start", () => {
    sendDayStartToShop(shop, 1);
    system.run(makeCtx(10));

    bus.flush();
    const msgs = bus.drain().filter((m) => m.ontology === ONT_SHOP.DAILY_SLATE);
    expect(msgs.length).toBe(1);
    expect(msgs[0]!.recipient).toBe("broadcast");
    const body = msgs[0]!.body as { offers: unknown[] };
    expect(Array.isArray(body.offers)).toBe(true);
    expect(body.offers.length).toBe(SLATE_SIZE);
  });

  it("does not generate a new slate on a non-day-boundary tick", () => {
    sendDayStartToShop(shop, 1);
    system.run(makeCtx(10));
    const firstSlate = shop.shopkeeper!.dailySlate;

    system.run(makeCtx(11));
    expect(shop.shopkeeper!.dailySlate).toBe(firstSlate);
  });

  it("replaces the slate on a new day-start", () => {
    sendDayStartToShop(shop, 1);
    system.run(makeCtx(10));
    const slateDay1 = shop.shopkeeper!.dailySlate;

    sendDayStartToShop(shop, 2);
    system.run(makeCtx(20));
    const slateDay2 = shop.shopkeeper!.dailySlate;

    expect(slateDay2).not.toBe(slateDay1);
    expect(slateDay2!.length).toBe(SLATE_SIZE);
  });

  it("does not re-process the same day twice", () => {
    sendDayStartToShop(shop, 1);
    system.run(makeCtx(10));
    bus.flush();
    bus.drain(); 

    sendDayStartToShop(shop, 1);
    system.run(makeCtx(11));
    bus.flush();
    const extra = bus.drain().filter((m) => m.ontology === ONT_SHOP.DAILY_SLATE);
    expect(extra.length).toBe(0);
  });

  it("is deterministic: same seed + same day sequence → same slate", () => {

    const w1 = new World<GameEntity>();
    const b1 = new MessageBus();
    const s1 = spawnShopkeeper(w1);
    const sys1 = new ShopSlateSystem(w1, b1, createRng(99));

    sendDayStartToShop(s1, 1);
    sys1.run(makeCtx(10));
    const slate1 = JSON.stringify(s1.shopkeeper!.dailySlate);

    const w2 = new World<GameEntity>();
    const b2 = new MessageBus();
    const s2 = spawnShopkeeper(w2);
    const sys2 = new ShopSlateSystem(w2, b2, createRng(99));

    sendDayStartToShop(s2, 1);
    sys2.run(makeCtx(10));
    const slate2 = JSON.stringify(s2.shopkeeper!.dailySlate);

    expect(slate1).toBe(slate2);
  });

  it("daily slate offers match the broadcast body", () => {
    sendDayStartToShop(shop, 1);
    system.run(makeCtx(10));

    bus.flush();
    const msgs = bus.drain().filter((m) => m.ontology === ONT_SHOP.DAILY_SLATE);
    const body = msgs[0]!.body as { offers: unknown[] };
    expect(JSON.stringify(body.offers)).toBe(JSON.stringify(shop.shopkeeper!.dailySlate));
  });
});
