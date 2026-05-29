import { describe, it, expect, beforeEach } from "vitest";
import { World } from "@engine/core";
import type { GameEntity } from "../components";
import { EventFeedSystem, EVENT_FEED_CAP } from "./event-feed";
import type { DayClockSystem } from "./day-clock";
import { ONT_MARKET } from "../protocols/market";
import { ONT_SHOP } from "../protocols/shop";
import { ONT_SIMULATION } from "../protocols/simulation";
import { ONT_ENCOUNTER } from "../protocols/encounter";
import { PERFORMATIVE } from "../protocols";

/** Minimal DayClock stub — EventFeedSystem only reads `.day`. */
function fakeClock(day: number): DayClockSystem {
  return { day } as unknown as DayClockSystem;
}

function makeFarmer(world: World<GameEntity>, name: string): GameEntity {
  return world.spawn({
    farmer: { name, currentRegion: "village" },
    inbox: { messages: [] },
  });
}

function makeWall(world: World<GameEntity>): GameEntity {
  return world.spawn({
    marketWall: { isMarketWall: true },
    inbox: { messages: [] },
  });
}

function push(
  entity: GameEntity,
  ontology: string,
  sender: number | "world",
  body: Record<string, unknown>,
): void {
  entity.inbox!.messages.push({
    performative: PERFORMATIVE.INFORM,
    ontology,
    sender,
    body,
    tickIssued: 0,
  });
}

describe("EventFeedSystem", () => {
  let world: World<GameEntity>;

  beforeEach(() => {
    world = new World<GameEntity>();
  });

  it("captures a TRADE_COMPLETED from the market wall inbox", () => {
    const buyer = makeFarmer(world, "Hannah");
    const seller = makeFarmer(world, "Otto");
    const wall = makeWall(world);
    push(wall, ONT_MARKET.TRADE_COMPLETED, seller.id!, {
      offerId: "abc",
      buyerId: buyer.id!,
      sellerId: seller.id!,
      crop: "radish",
      quantity: 3,
      pricePerUnit: 8,
    });

    const feed = new EventFeedSystem(world, fakeClock(7));
    feed.run({ tick: 1 });

    const entries = feed.recent();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.day).toBe(7);
    expect(entries[0]!.text).toBe("Hannah bought 3 radish from Otto (24g)");
  });

  it("captures an AUCTION_RESULT and a SHOCK from the wall inbox", () => {
    const winner = makeFarmer(world, "Cora");
    const wall = makeWall(world);
    push(wall, ONT_SHOP.AUCTION_RESULT, "world", {
      auctionId: "auc-1",
      winnerId: winner.id!,
      paidPrice: 45,
      participants: [winner.id!],
    });
    push(wall, ONT_SIMULATION.SHOCK, "world", {
      kind: "blight",
      day: 12,
      targetFarmerId: 999,
      targetName: "Atticus",
      plotsWiped: 1,
    });

    const feed = new EventFeedSystem(world, fakeClock(12));
    feed.run({ tick: 5 });

    const texts = feed.recent().map((e) => e.text);
    expect(texts).toContain("Auction won by Cora at 45g");
    expect(texts).toContain("Drought! Atticus lost 1 crop");
  });

  it("captures an encounter ACCEPT from a farmer inbox", () => {
    const initiator = makeFarmer(world, "Cora");
    const accepter = makeFarmer(world, "Otto");
    push(initiator, ONT_ENCOUNTER.ACCEPT, accepter.id!, { offerId: "o1" });

    const feed = new EventFeedSystem(world, fakeClock(3));
    feed.run({ tick: 2 });

    const entries = feed.recent();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe("Otto accepted Cora's seed offer");
  });

  it("dedups a message that lingers across ticks", () => {
    const buyer = makeFarmer(world, "Hannah");
    const seller = makeFarmer(world, "Otto");
    const wall = makeWall(world);
    push(wall, ONT_MARKET.TRADE_COMPLETED, seller.id!, {
      offerId: "abc",
      buyerId: buyer.id!,
      sellerId: seller.id!,
    });

    const feed = new EventFeedSystem(world, fakeClock(1));
    feed.run({ tick: 1 });
    feed.run({ tick: 2 }); // same message still in inbox — must not re-add

    expect(feed.recent()).toHaveLength(1);
  });

  it("orders events captured in the same tick deterministically by key", () => {
    // Two distinct auctions captured on the same tick must sort by key.
    const a = makeFarmer(world, "Cora");
    const b = makeFarmer(world, "Otto");
    const wall = makeWall(world);
    push(wall, ONT_SHOP.AUCTION_RESULT, "world", {
      auctionId: "zzz",
      winnerId: b.id!,
      paidPrice: 10,
      participants: [b.id!],
    });
    push(wall, ONT_SHOP.AUCTION_RESULT, "world", {
      auctionId: "aaa",
      winnerId: a.id!,
      paidPrice: 20,
      participants: [a.id!],
    });

    const feed = new EventFeedSystem(world, fakeClock(0));
    feed.run({ tick: 1 });

    const keys = feed.recent().map((e) => e.key);
    expect(keys).toEqual(["auction:aaa", "auction:zzz"]);
  });

  it("caps the internal list at EVENT_FEED_CAP", () => {
    const wall = makeWall(world);
    const feed = new EventFeedSystem(world, fakeClock(0));
    // Each tick pushes one fresh, unique auction result.
    for (let i = 0; i < EVENT_FEED_CAP + 20; i += 1) {
      wall.inbox!.messages.length = 0;
      push(wall, ONT_SHOP.AUCTION_RESULT, "world", {
        auctionId: `auc-${i}`,
        winnerId: null,
        paidPrice: 1,
        participants: [],
      });
      feed.run({ tick: i });
    }
    expect(feed.recent()).toHaveLength(EVENT_FEED_CAP);
  });
});
