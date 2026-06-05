import { ZERO_CROPS } from "../economy";
import { describe, it, expect, beforeEach } from "vitest";
import { World, MessageBus } from "@engine/core";
import type { GameEntity, FarmerFsmState } from "../components";
import { ActSystem } from "./act";
import { ShopkeeperSystem } from "./shopkeeper";
import { AuctionSystem } from "./auction";
import { InboxDispatchSystem } from "./inbox-dispatch";
import { spawnShopkeeper } from "../agents/market-wall";
import { createRng } from "@engine/core";
import { ONT_SHOP, type ShopSellBody } from "../protocols/shop";
import { PERFORMATIVE } from "../protocols/performatives";
import type { ShopOffer } from "../agents/shop-slate";

function makeOffer(
  partial: Partial<ShopOffer> & Pick<ShopOffer, "crop" | "unitPrice" | "remaining">,
): ShopOffer {
  return {
    offerId: partial.offerId ?? `o-${partial.crop}-${partial.unitPrice}-${partial.remaining}`,
    kind: "sell",
    crop: partial.crop,
    unitPrice: partial.unitPrice,
    quantity: partial.quantity ?? partial.remaining,
    remaining: partial.remaining,
  };
}

function makeFarmer(
  world: World<GameEntity>,
  opts: { gold?: number; seeds?: Partial<Record<"radish" | "wheat" | "pumpkin", number>> } = {},
): GameEntity {
  return world.spawn({
    farmer: { name: "F", currentRegion: "village" as const },
    fsm: { current: "ACT" as FarmerFsmState, enteredTick: 0 },
    intentions: { queue: [] },
    inventory: {
      gold: opts.gold ?? 100,
      crops: { ...ZERO_CROPS },
      seeds: { ...ZERO_CROPS, ...(opts.seeds ?? {}) },
    },
    beliefs: { data: { currentDay: 0 }, revision: 0 },
  });
}

// As of the open-questions-round refactor, buy-seed no longer mutates the shop
// slate directly inside ActSystem. It emits an ONT_SHOP.SELL message to the
// shopkeeper (shop sells a seed to the farmer); ShopkeeperSystem.handleSell
// owns slate consumption, gold checks, and seed crediting. The slate-rejection
// edge cases (no-matching-offer / insufficient-stock / insufficient-gold /
// golden-bean ban / multi-offer fill) live in shopkeeper.test.ts now.
describe("ActSystem buy-seed (emits ONT_SHOP.SELL)", () => {
  let world: World<GameEntity>;
  let bus: MessageBus;
  let sys: ActSystem;
  let shopEntity: GameEntity;

  beforeEach(() => {
    world = new World<GameEntity>();
    bus = new MessageBus();
    sys = new ActSystem(world, bus);
    shopEntity = spawnShopkeeper(world);
  });

  it("buy-seed emits one ONT_SHOP.SELL message addressed to the shopkeeper", () => {
    const farmer = makeFarmer(world, { gold: 50 });
    farmer.intentions!.queue.push({
      kind: "buy-seed",
      data: { crop: "radish", quantity: 3 },
      priority: 0,
    });

    sys.run({ tick: 1 });
    bus.flush();
    const sent = bus.drain();

    const sell = sent.filter((m) => m.ontology === ONT_SHOP.SELL);
    expect(sell.length).toBe(1);
    const m = sell[0]!;
    expect(m.recipient).toBe(shopEntity.id);
    expect(m.sender).toBe(farmer.id);
    expect(m.performative).toBe(PERFORMATIVE.REQUEST);
    const body = m.body as unknown as ShopSellBody;
    expect(body.item).toBe("seed");
    expect(body.crop).toBe("radish");
    expect(body.quantity).toBe(3);

    // ActSystem still transitions the farmer and clears its queue this tick.
    expect(farmer.fsm!.current).toBe("FINISH_DAY");
    expect(farmer.intentions!.queue.length).toBe(0);

    // ActSystem itself does NOT touch inventory or slate anymore.
    expect(farmer.inventory!.gold).toBe(50);
    expect(farmer.inventory!.seeds.radish).toBe(0);
  });

  it("buy-seed defaults quantity to 1 when omitted", () => {
    const farmer = makeFarmer(world);
    farmer.intentions!.queue.push({
      kind: "buy-seed",
      data: { crop: "wheat" },
      priority: 0,
    });

    sys.run({ tick: 1 });
    bus.flush();
    const body = bus.drain().find((m) => m.ontology === ONT_SHOP.SELL)!
      .body as unknown as ShopSellBody;
    expect(body.quantity).toBe(1);
  });

  it("buy-seed emits nothing when no shopkeeper entity exists", () => {
    const freshWorld = new World<GameEntity>();
    const freshBus = new MessageBus();
    const freshSys = new ActSystem(freshWorld, freshBus);
    const farmer = makeFarmer(freshWorld);
    farmer.intentions!.queue.push({
      kind: "buy-seed",
      data: { crop: "radish", quantity: 1 },
      priority: 0,
    });

    freshSys.run({ tick: 1 });
    freshBus.flush();
    expect(freshBus.drain().filter((m) => m.ontology === ONT_SHOP.SELL).length).toBe(0);
  });
});

// End-to-end: the seed lands one tick after the buy-seed ACT, via the bus +
// InboxDispatchSystem + ShopkeeperSystem.handleSell. This documents the
// accepted one-tick latency the refactor introduces.
describe("ActSystem buy-seed end-to-end through the shopkeeper", () => {
  it("credits seeds + decrements gold and slate one tick later", () => {
    const world = new World<GameEntity>();
    const bus = new MessageBus();
    const act = new ActSystem(world, bus);
    const dispatch = new InboxDispatchSystem(bus, world);
    const auction = new AuctionSystem(bus, world, createRng(1));
    const shop = new ShopkeeperSystem(bus, world, auction);

    const shopEntity = spawnShopkeeper(world);
    const radishOffer = makeOffer({ crop: "radish", unitPrice: 5, remaining: 10 });
    shopEntity.shopkeeper!.dailySlate = [radishOffer];

    const farmer = makeFarmer(world, { gold: 50 });
    farmer.intentions!.queue.push({
      kind: "buy-seed",
      data: { crop: "radish", quantity: 3 },
      priority: 0,
    });

    // Tick 1: ActSystem emits the SELL; nothing applied yet.
    act.run({ tick: 1 });
    expect(farmer.inventory!.gold).toBe(50);
    expect(farmer.inventory!.seeds.radish).toBe(0);

    // Tick 2: dispatch delivers to the shop inbox, ShopkeeperSystem applies it.
    dispatch.run({ tick: 2 });
    shop.run({ tick: 2 });

    expect(farmer.inventory!.gold).toBe(35); // 50 - 5*3
    expect(farmer.inventory!.seeds.radish).toBe(3);
    expect(radishOffer.remaining).toBe(7);
  });
});
