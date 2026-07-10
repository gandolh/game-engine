import { describe, it, expect, beforeEach } from "vitest";
import { World } from "@engine/core";
import type { GameEntity } from "../components";
import { EventFeedSystem, EVENT_FEED_CAP } from "./event-feed";
import type { DayClockSystem } from "./world-time/day-clock";
import type { RunHistorySystem, RunHistoryRow } from "./messaging/run-history";
import { ONT_MARKET } from "../protocols/market";
import { ONT_SHOP } from "../protocols/shop";
import { ONT_SIMULATION } from "../protocols/simulation";
import { ONT_ENCOUNTER } from "../protocols/encounter";
import { PERFORMATIVE } from "../protocols";

function fakeClock(day: number, maxDays = 100): DayClockSystem {
  return { day, maxDays } as unknown as DayClockSystem;
}

function fakeHistory(rows: RunHistoryRow[]): RunHistorySystem {
  return { history: () => rows } as unknown as RunHistorySystem;
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
    expect(texts).toContain("Cora won the golden bean at 45g");
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
    feed.run({ tick: 2 }); 

    expect(feed.recent()).toHaveLength(1);
  });

  it("orders events captured in the same tick deterministically by key", () => {

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

  it("bounds the dedup-key memory (seen) with drop-oldest eviction", () => {
    const wall = makeWall(world);
    const cap = 8;
    const feed = new EventFeedSystem(world, fakeClock(0), undefined, undefined, cap);

    // Feed far more distinct auction results than the cap; each contributes one
    // `auction:<id>` dedup key. Without eviction `seen` would grow unbounded.
    for (let i = 0; i < cap + 50; i += 1) {
      wall.inbox!.messages.length = 0;
      push(wall, ONT_SHOP.AUCTION_RESULT, "world", {
        auctionId: `bound-${i}`,
        winnerId: 1,
        paidPrice: 1,
        participants: [1],
      });
      feed.run({ tick: i });
    }

    expect(feed.seenSize()).toBeLessThanOrEqual(cap);
    expect(feed.seenSize()).toBeGreaterThan(0);
  });

  it("every captured entry carries a drama score in [0, 1]", () => {
    const buyer = makeFarmer(world, "Hannah");
    const seller = makeFarmer(world, "Otto");
    const wall = makeWall(world);

    push(wall, ONT_MARKET.TRADE_COMPLETED, seller.id!, {
      offerId: "t1",
      buyerId: buyer.id!,
      sellerId: seller.id!,
      crop: "radish",
      quantity: 2,
      pricePerUnit: 5,
    });
    push(wall, ONT_SHOP.AUCTION_RESULT, "world", {
      auctionId: "auc-1",
      winnerId: buyer.id!,
      paidPrice: 40,
      participants: [buyer.id!],
    });
    push(wall, ONT_SIMULATION.SHOCK, "world", {
      kind: "blight",
      day: 5,
      targetFarmerId: seller.id!,
      targetName: "Otto",
      plotsWiped: 2,
    });

    const feed = new EventFeedSystem(world, fakeClock(5));
    feed.run({ tick: 1 });

    const entries = feed.recent();
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      expect(typeof e.drama).toBe("number");
      expect(e.drama).toBeGreaterThanOrEqual(0);
      expect(e.drama).toBeLessThanOrEqual(1);
    }
  });

  it("a shock event scores higher drama than a routine trade", () => {
    const buyer = makeFarmer(world, "Hannah");
    const seller = makeFarmer(world, "Otto");
    const wall = makeWall(world);
    push(wall, ONT_MARKET.TRADE_COMPLETED, seller.id!, {
      offerId: "t1",
      buyerId: buyer.id!,
      sellerId: seller.id!,
      crop: "radish",
      quantity: 1,
      pricePerUnit: 5,
    });
    push(wall, ONT_SIMULATION.SHOCK, "world", {
      kind: "blight",
      day: 50,
      targetFarmerId: seller.id!,
      targetName: "Otto",
      plotsWiped: 1,
    });

    const feed = new EventFeedSystem(world, fakeClock(50));
    feed.run({ tick: 1 });

    const entries = feed.recent();
    const trade = entries.find((e) => e.key.startsWith("trade:"));
    const shock = entries.find((e) => e.key.startsWith("shock:"));
    expect(trade).toBeDefined();
    expect(shock).toBeDefined();
    expect(shock!.drama).toBeGreaterThan(trade!.drama);
  });

  it("emits a rank-flip line when the top-rank farmer changes day-over-day", () => {
    const farmerA = makeFarmer(world, "Cora");
    const farmerB = makeFarmer(world, "Otto");

    const historyRows: RunHistoryRow[] = [
      { day: 9, farmerId: farmerA.id!, gold: 200, rank: 1 },
      { day: 9, farmerId: farmerB.id!, gold: 180, rank: 2 },
      { day: 10, farmerId: farmerB.id!, gold: 210, rank: 1 },
      { day: 10, farmerId: farmerA.id!, gold: 195, rank: 2 },
    ];
    const hist = fakeHistory(historyRows);

    const feed = new EventFeedSystem(world, fakeClock(9), undefined, hist);
    feed.run({ tick: 100 }); 

    let entries = feed.recent();
    const rankFlip9 = entries.find((e) => e.key.startsWith("rankflip:"));
    expect(rankFlip9).toBeUndefined(); 

    const feed2 = new EventFeedSystem(world, fakeClock(10), undefined, hist);

    feed2.run({ tick: 100 });  

    const histRows2: RunHistoryRow[] = [
      { day: 1, farmerId: farmerA.id!, gold: 200, rank: 1 },
      { day: 1, farmerId: farmerB.id!, gold: 180, rank: 2 },
      { day: 2, farmerId: farmerB.id!, gold: 210, rank: 1 },
      { day: 2, farmerId: farmerA.id!, gold: 195, rank: 2 },
    ];
    const hist2 = fakeHistory(histRows2);

    let currentDay = 1;
    const clock: DayClockSystem = {
      get day() { return currentDay; },
      maxDays: 100,
    } as unknown as DayClockSystem;

    const feed3 = new EventFeedSystem(world, clock, undefined, hist2);
    feed3.run({ tick: 10 }); 

    entries = feed3.recent();
    expect(entries.find((e) => e.key.startsWith("rankflip:"))).toBeUndefined();

    currentDay = 2;
    feed3.run({ tick: 20 }); 

    entries = feed3.recent();
    const flip = entries.find((e) => e.key.startsWith("rankflip:"));
    expect(flip).toBeDefined();
    expect(flip!.text).toContain("Otto");
    expect(flip!.text).toContain("Cora");
    expect(flip!.text).toContain("1st");
    expect(flip!.drama).toBeGreaterThanOrEqual(0);
    expect(flip!.drama).toBeLessThanOrEqual(1);
  });

  it("does not emit a rank-flip when runHistory is not injected", () => {
    const wall = makeWall(world);

    const feed = new EventFeedSystem(world, fakeClock(50));
    push(wall, ONT_SHOP.AUCTION_RESULT, "world", {
      auctionId: "auc-x",
      winnerId: null,
      paidPrice: 1,
      participants: [],
    });
    feed.run({ tick: 1 });

    const entries = feed.recent();
    const flip = entries.find((e) => e.key.startsWith("rankflip:"));
    expect(flip).toBeUndefined();
  });
});
