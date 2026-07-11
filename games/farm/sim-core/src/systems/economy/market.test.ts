import { ZERO_CROPS, bankHarvest, totalCropCount } from "../../economy";
import { describe, it, expect, beforeEach } from "vitest";
import { MessageBus, World, createRng } from "@engine/core";
import type { GameEntity } from "../../components";
import { MarketSystem } from "./market";
import { WallTradeSystem } from "./wall-trade";
import { spawnMarketWall } from "../../agents/market-wall";
import { ONT_MARKET, type MarketRejectedBody } from "../../protocols/market";
import { PERFORMATIVE } from "../../protocols/performatives";
import type { RegionId } from "../../world/regions";

function makeFarmer(
  world: World<GameEntity>,
  gold = 50,
  region: RegionId = "village",
): GameEntity {
  return world.spawn({
    farmer: { name: "F", currentRegion: region },
    inbox: { messages: [] },
    inventory: {
      gold,
      // Sellers must actually own what they list: POST_OFFER escrows the stock
      // (brief 98), so an offer the seller can't cover is never stored.
      crops: { ...ZERO_CROPS, radish: 5, wheat: 5, pumpkin: 5 },
      seeds: { ...ZERO_CROPS },
    },
    beliefs: { data: { currentDay: 3 }, revision: 0 },
  });
}

function pushToWall(wall: GameEntity, msg: {
  ontology: string;
  sender: number;
  body: Record<string, unknown>;
  performative?: string;
}): void {
  wall.inbox!.messages.push({
    performative: msg.performative ?? PERFORMATIVE.INFORM,
    ontology: msg.ontology,
    sender: msg.sender,
    body: msg.body,
    tickIssued: 0,
  });
}

/** Stand-in for InboxDispatchSystem: flush the bus into recipients' inboxes. */
function dispatch(world: World<GameEntity>, bus: MessageBus): void {
  bus.flush();
  for (const msg of bus.drain()) {
    for (const entity of world.query("inbox")) {
      if (entity.id !== msg.recipient) continue;
      entity.inbox!.messages.push({
        performative: msg.performative,
        ontology: msg.ontology,
        sender: msg.sender,
        body: msg.body,
        tickIssued: msg.tickIssued,
      });
    }
  }
}

describe("MarketSystem", () => {
  let world: World<GameEntity>;
  let bus: MessageBus;
  let wall: GameEntity;

  beforeEach(() => {
    world = new World<GameEntity>();
    bus = new MessageBus();
    wall = spawnMarketWall(world);
  });

  it("POST_OFFER stores an offer, READ_OFFERS returns it", () => {
    const sys = new MarketSystem(bus, world, createRng(1));
    const farmer = makeFarmer(world);
    pushToWall(wall, {
      ontology: ONT_MARKET.POST_OFFER,
      sender: farmer.id!,
      body: { offer: { crop: "radish", quantity: 3, pricePerUnit: 7 } },
    });
    sys.run({ tick: 1 });

    expect(sys.offersById.size).toBe(1);
    const stored = Array.from(sys.offersById.values())[0]!;
    expect(stored.sellerId).toBe(farmer.id);
    expect(stored.crop).toBe("radish");
    expect(stored.quantity).toBe(3);
    expect(stored.pricePerUnit).toBe(7);
    expect(stored.postedDay).toBe(3);

    pushToWall(wall, {
      ontology: ONT_MARKET.READ_OFFERS,
      sender: farmer.id!,
      body: {},
    });
    sys.run({ tick: 2 });

    bus.flush();
    const drained = bus.drain();
    const offersList = drained.find((m) => m.ontology === ONT_MARKET.OFFERS_LIST);
    expect(offersList).toBeDefined();
    expect(offersList!.recipient).toBe(farmer.id);
    const offers = (offersList!.body as { offers: unknown[] }).offers;
    expect(offers).toHaveLength(1);
  });

  it("CANCEL_OFFER from non-seller is ignored; from seller removes the offer", () => {
    const sys = new MarketSystem(bus, world, createRng(1));
    const seller = makeFarmer(world);
    const stranger = makeFarmer(world);
    pushToWall(wall, {
      ontology: ONT_MARKET.POST_OFFER,
      sender: seller.id!,
      body: { offer: { crop: "wheat", quantity: 1, pricePerUnit: 9 } },
    });
    sys.run({ tick: 1 });
    expect(sys.offersById.size).toBe(1);
    const offerId = Array.from(sys.offersById.keys())[0]!;

    pushToWall(wall, {
      ontology: ONT_MARKET.CANCEL_OFFER,
      sender: stranger.id!,
      body: { offerId },
    });
    sys.run({ tick: 2 });
    expect(sys.offersById.size).toBe(1);

    pushToWall(wall, {
      ontology: ONT_MARKET.CANCEL_OFFER,
      sender: seller.id!,
      body: { offerId },
    });
    sys.run({ tick: 3 });
    expect(sys.offersById.size).toBe(0);
  });

  it("TRADE_COMPLETED removes the offer", () => {
    const sys = new MarketSystem(bus, world, createRng(1));
    const farmer = makeFarmer(world);
    pushToWall(wall, {
      ontology: ONT_MARKET.POST_OFFER,
      sender: farmer.id!,
      body: { offer: { crop: "radish", quantity: 1, pricePerUnit: 6 } },
    });
    sys.run({ tick: 1 });
    const offerId = Array.from(sys.offersById.keys())[0]!;

    pushToWall(wall, {
      ontology: ONT_MARKET.TRADE_COMPLETED,
      sender: farmer.id!,
      body: { offerId },
    });
    sys.run({ tick: 2 });
    expect(sys.offersById.size).toBe(0);
  });

  it("BUY_REQUEST is forwarded to the offer's seller", () => {
    const sys = new MarketSystem(bus, world, createRng(1));
    const seller = makeFarmer(world);
    const buyer = makeFarmer(world);
    pushToWall(wall, {
      ontology: ONT_MARKET.POST_OFFER,
      sender: seller.id!,
      body: { offer: { crop: "pumpkin", quantity: 2, pricePerUnit: 30 } },
    });
    sys.run({ tick: 1 });
    const offerId = Array.from(sys.offersById.keys())[0]!;

    pushToWall(wall, {
      ontology: ONT_MARKET.BUY_REQUEST,
      sender: buyer.id!,
      body: { offerId, buyerId: buyer.id, pricePerUnit: 30, quantity: 2 },
    });
    sys.run({ tick: 2 });

    bus.flush();
    const forwarded = bus.drain().find(
      (m) => m.ontology === ONT_MARKET.BUY_REQUEST && m.recipient === seller.id,
    );
    expect(forwarded).toBeDefined();
    expect(forwarded!.performative).toBe(PERFORMATIVE.REQUEST);
    const body = forwarded!.body as { offerId: string; buyerId: number };
    expect(body.offerId).toBe(offerId);
    expect(body.buyerId).toBe(buyer.id);
  });

  it("offerId generation is deterministic for the same rng seed", () => {
    const collect = (): string[] => {
      const w = new World<GameEntity>();
      const b = new MessageBus();
      const wallE = spawnMarketWall(w);
      const farmer = makeFarmer(w);
      const sys = new MarketSystem(b, w, createRng(42));
      for (let i = 0; i < 5; i++) {
        wallE.inbox!.messages.push({
          performative: PERFORMATIVE.INFORM,
          ontology: ONT_MARKET.POST_OFFER,
          sender: farmer.id!,
          body: { offer: { crop: "radish", quantity: 1, pricePerUnit: 1 } },
          tickIssued: 0,
        });
        sys.run({ tick: i });
      }
      return Array.from(sys.offersById.keys());
    };
    const idsA = collect();
    const idsB = collect();
    expect(idsA).toEqual(idsB);
    expect(new Set(idsA).size).toBe(idsA.length); 
  });

  it("POST_OFFER from a non-existent farmer is silently ignored", () => {
    const sys = new MarketSystem(bus, world, createRng(1));
    pushToWall(wall, {
      ontology: ONT_MARKET.POST_OFFER,
      sender: 9999, 
      body: { offer: { crop: "radish", quantity: 1, pricePerUnit: 5 } },
    });
    sys.run({ tick: 1 });
    expect(sys.offersById.size).toBe(0);
  });

  it("POST_OFFER from a farm region is rejected, no offer stored", () => {
    const sys = new MarketSystem(bus, world, createRng(1));
    const farmer = makeFarmer(world, 50, "farm-cora");
    pushToWall(wall, {
      ontology: ONT_MARKET.POST_OFFER,
      sender: farmer.id!,
      body: { offer: { crop: "radish", quantity: 1, pricePerUnit: 5 } },
    });
    sys.run({ tick: 1 });

    expect(sys.offersById.size).toBe(0);

    bus.flush();
    const rejection = bus
      .drain()
      .find((m) => m.ontology === ONT_MARKET.REJECTED && m.recipient === farmer.id);
    expect(rejection).toBeDefined();
    expect(rejection!.performative).toBe(PERFORMATIVE.REFUSE);
    const body = rejection!.body as unknown as MarketRejectedBody;
    expect(body.reason).toBe("not-in-village");
    expect(body.originalOntology).toBe(ONT_MARKET.POST_OFFER);
  });

  it("POST_OFFER from village succeeds (no rejection emitted)", () => {
    const sys = new MarketSystem(bus, world, createRng(1));
    const farmer = makeFarmer(world, 50, "village");
    pushToWall(wall, {
      ontology: ONT_MARKET.POST_OFFER,
      sender: farmer.id!,
      body: { offer: { crop: "radish", quantity: 1, pricePerUnit: 5 } },
    });
    sys.run({ tick: 1 });

    expect(sys.offersById.size).toBe(1);
    bus.flush();
    const rejection = bus.drain().find((m) => m.ontology === ONT_MARKET.REJECTED);
    expect(rejection).toBeUndefined();
  });

  it("CANCEL_OFFER from a farm region is rejected, offer remains", () => {
    const sys = new MarketSystem(bus, world, createRng(1));
    const farmer = makeFarmer(world, 50, "village");
    pushToWall(wall, {
      ontology: ONT_MARKET.POST_OFFER,
      sender: farmer.id!,
      body: { offer: { crop: "radish", quantity: 1, pricePerUnit: 5 } },
    });
    sys.run({ tick: 1 });
    expect(sys.offersById.size).toBe(1);
    const offerId = Array.from(sys.offersById.keys())[0]!;

    farmer.farmer!.currentRegion = "farm-cora";
    pushToWall(wall, {
      ontology: ONT_MARKET.CANCEL_OFFER,
      sender: farmer.id!,
      body: { offerId },
    });
    sys.run({ tick: 2 });

    expect(sys.offersById.size).toBe(1);
    bus.flush();
    const rejection = bus
      .drain()
      .find((m) => m.ontology === ONT_MARKET.REJECTED && m.recipient === farmer.id);
    expect(rejection).toBeDefined();
    const body = rejection!.body as unknown as MarketRejectedBody;
    expect(body.originalOntology).toBe(ONT_MARKET.CANCEL_OFFER);
  });

  it("POST_OFFER escrows the seller's stock; an uncovered offer is never stored", () => {
    const sys = new MarketSystem(bus, world, createRng(1));
    const farmer = makeFarmer(world);
    pushToWall(wall, {
      ontology: ONT_MARKET.POST_OFFER,
      sender: farmer.id!,
      body: { offer: { crop: "radish", quantity: 3, pricePerUnit: 7 } },
    });
    sys.run({ tick: 1 });
    // 3 radish moved off the seller and into the wall's escrow.
    expect(farmer.inventory!.crops.radish).toBe(2);
    expect(sys.offersById.size).toBe(1);

    // Nothing left to cover a 10-radish listing: no offer, no phantom stock.
    pushToWall(wall, {
      ontology: ONT_MARKET.POST_OFFER,
      sender: farmer.id!,
      body: { offer: { crop: "carrot", quantity: 4, pricePerUnit: 9 } },
    });
    sys.run({ tick: 2 });
    expect(sys.offersById.size).toBe(1);
    expect(farmer.inventory!.crops.carrot).toBe(0);
  });

  it("a wall trade conserves gold and stock — nothing is created or destroyed", () => {
    const sys = new MarketSystem(bus, world, createRng(1));
    const trades = new WallTradeSystem(world, bus, sys);
    const seller = makeFarmer(world, 40);
    const buyer = makeFarmer(world, 200);
    // Give the seller graded stock so the tiers have to survive the move too.
    seller.inventory!.crops.radish = 0;
    buyer.inventory!.crops.radish = 0;
    bankHarvest(seller.inventory!, "radish", 2, "gold");
    bankHarvest(seller.inventory!, "radish", 1, "silver");

    const goldBefore = seller.inventory!.gold + buyer.inventory!.gold;
    const radishBefore =
      totalCropCount(seller.inventory!, "radish") + totalCropCount(buyer.inventory!, "radish");
    const sellerGold0 = seller.inventory!.gold;
    const buyerGold0 = buyer.inventory!.gold;

    pushToWall(wall, {
      ontology: ONT_MARKET.POST_OFFER,
      sender: seller.id!,
      body: { offer: { crop: "radish", quantity: 3, pricePerUnit: 7 } },
    });
    sys.run({ tick: 1 });
    const offerId = Array.from(sys.offersById.keys())[0]!;

    pushToWall(wall, {
      ontology: ONT_MARKET.BUY_REQUEST,
      sender: buyer.id!,
      body: { offerId, buyerId: buyer.id, pricePerUnit: 7, quantity: 3 },
    });
    sys.run({ tick: 2 });

    // InboxDispatchSystem's job: hand the wall's forwarded request to the seller.
    dispatch(world, bus);
    trades.run({ tick: 3 });

    // Directional: buyer gold down == seller gold up; buyer stock up == seller stock down.
    const cost = 7 * 3;
    expect(buyerGold0 - buyer.inventory!.gold).toBe(cost);
    expect(seller.inventory!.gold - sellerGold0).toBe(cost);
    expect(totalCropCount(buyer.inventory!, "radish")).toBe(3);
    expect(totalCropCount(seller.inventory!, "radish")).toBe(0);

    // Conservation across the whole flow (escrow included — the offer is gone).
    expect(seller.inventory!.gold + buyer.inventory!.gold).toBe(goldBefore);
    expect(
      totalCropCount(seller.inventory!, "radish") + totalCropCount(buyer.inventory!, "radish"),
    ).toBe(radishBefore);

    // Quality tiers move with the goods rather than being re-minted as normal.
    expect(buyer.inventory!.cropQuality?.radish).toEqual({ normal: 0, silver: 1, gold: 2 });
    expect(seller.inventory!.cropQuality?.radish).toEqual({ normal: 0, silver: 0, gold: 0 });

    // The offer is retired and TRADE_COMPLETED is on the wire for trust/event-feed.
    expect(sys.offersById.size).toBe(0);
    bus.flush();
    const done = bus.drain().find((m) => m.ontology === ONT_MARKET.TRADE_COMPLETED);
    expect(done).toBeDefined();
    expect(done!.recipient).toBe(wall.id);
    expect(done!.body).toMatchObject({ offerId, buyerId: buyer.id, sellerId: seller.id, quantity: 3 });
  });

  it("a buyer who cannot cover the price closes no trade and moves no value", () => {
    const sys = new MarketSystem(bus, world, createRng(1));
    const trades = new WallTradeSystem(world, bus, sys);
    const seller = makeFarmer(world, 40);
    const buyer = makeFarmer(world, 5);
    buyer.inventory!.crops.radish = 0;

    pushToWall(wall, {
      ontology: ONT_MARKET.POST_OFFER,
      sender: seller.id!,
      body: { offer: { crop: "radish", quantity: 3, pricePerUnit: 7 } },
    });
    sys.run({ tick: 1 });
    const offerId = Array.from(sys.offersById.keys())[0]!;

    pushToWall(wall, {
      ontology: ONT_MARKET.BUY_REQUEST,
      sender: buyer.id!,
      body: { offerId, buyerId: buyer.id, pricePerUnit: 7, quantity: 3 },
    });
    sys.run({ tick: 2 });
    dispatch(world, bus);
    trades.run({ tick: 3 });

    expect(buyer.inventory!.gold).toBe(5);
    expect(seller.inventory!.gold).toBe(40);
    expect(totalCropCount(buyer.inventory!, "radish")).toBe(0);
    expect(sys.offersById.size).toBe(1); // offer stays on the wall
  });

  it("two buyers racing the same offer cannot both be filled (escrow is authoritative)", () => {
    const sys = new MarketSystem(bus, world, createRng(1));
    const trades = new WallTradeSystem(world, bus, sys);
    const seller = makeFarmer(world, 40);
    const buyerA = makeFarmer(world, 200);
    const buyerB = makeFarmer(world, 200);
    buyerA.inventory!.crops.radish = 0;
    buyerB.inventory!.crops.radish = 0;

    pushToWall(wall, {
      ontology: ONT_MARKET.POST_OFFER,
      sender: seller.id!,
      body: { offer: { crop: "radish", quantity: 3, pricePerUnit: 7 } },
    });
    sys.run({ tick: 1 });
    const offerId = Array.from(sys.offersById.keys())[0]!;

    for (const b of [buyerA, buyerB]) {
      pushToWall(wall, {
        ontology: ONT_MARKET.BUY_REQUEST,
        sender: b.id!,
        body: { offerId, buyerId: b.id, pricePerUnit: 7, quantity: 3 },
      });
    }
    sys.run({ tick: 2 });
    dispatch(world, bus);
    trades.run({ tick: 3 });

    const bought =
      totalCropCount(buyerA.inventory!, "radish") + totalCropCount(buyerB.inventory!, "radish");
    expect(bought).toBe(3); // exactly one fill, not two
    expect(seller.inventory!.gold).toBe(40 + 21);
    expect(sys.offersById.size).toBe(0);
  });

  it("offersById stays bounded: unsold offers expire and their escrow returns to the seller", () => {
    const ticksPerDay = 10;
    const sys = new MarketSystem(bus, world, createRng(1), { ticksPerDay, ttlDays: 2 });
    const farmer = makeFarmer(world, 50);
    const ttlTicks = ticksPerDay * 2;

    // 30 in-village posts across a long run; nobody ever buys.
    let tick = 0;
    for (let i = 0; i < 30; i++) {
      farmer.inventory!.crops.radish += 1; // a fresh harvest each round
      pushToWall(wall, {
        ontology: ONT_MARKET.POST_OFFER,
        sender: farmer.id!,
        body: { offer: { crop: "radish", quantity: 1, pricePerUnit: 7 } },
      });
      for (let t = 0; t < ttlTicks; t++) {
        sys.run({ tick: tick++ });
        // The wall never holds more than the offers posted inside one TTL window.
        expect(sys.offersById.size).toBeLessThanOrEqual(2);
      }
    }
    // Sweep the tail.
    for (let t = 0; t < ttlTicks + 1; t++) sys.run({ tick: tick++ });
    expect(sys.offersById.size).toBe(0);
    // Every escrowed radish came back: 5 starting + 30 harvested, none sold.
    expect(totalCropCount(farmer.inventory!, "radish")).toBe(35);
  });

  it("READ_OFFERS filter by crop returns only matching offers", () => {
    const sys = new MarketSystem(bus, world, createRng(1));
    const farmer = makeFarmer(world);
    farmer.inventory!.crops.wheat = 2;
    pushToWall(wall, {
      ontology: ONT_MARKET.POST_OFFER,
      sender: farmer.id!,
      body: { offer: { crop: "radish", quantity: 1, pricePerUnit: 5 } },
    });
    pushToWall(wall, {
      ontology: ONT_MARKET.POST_OFFER,
      sender: farmer.id!,
      body: { offer: { crop: "wheat", quantity: 2, pricePerUnit: 9 } },
    });
    sys.run({ tick: 1 });
    expect(sys.offersById.size).toBe(2);

    pushToWall(wall, {
      ontology: ONT_MARKET.READ_OFFERS,
      sender: farmer.id!,
      body: { filter: { crop: "wheat" } },
    });
    sys.run({ tick: 2 });

    bus.flush();
    const drained = bus.drain();
    const list = drained.find((m) => m.ontology === ONT_MARKET.OFFERS_LIST);
    expect(list).toBeDefined();
    const offers = (list!.body as { offers: Array<{ crop: string }> }).offers;
    expect(offers).toHaveLength(1);
    expect(offers[0]!.crop).toBe("wheat");
  });
});
