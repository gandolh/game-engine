import { describe, it, expect, beforeEach } from "vitest";
import { MessageBus, World, createRng } from "@engine/core";
import type { GameEntity } from "../components";
import { AuctionSystem } from "./auction";
import { spawnShopkeeper } from "../agents/market-wall";
import { ZERO_CROPS } from "../economy";
import { ONT_SHOP, type AuctionCfpBody, type AuctionResultBody } from "../protocols/shop";

function findResult(bus: MessageBus, auctionId: string): AuctionResultBody | undefined {
  bus.flush();
  for (const m of bus.drain()) {
    if (m.ontology !== ONT_SHOP.AUCTION_RESULT) continue;
    const body = m.body as unknown as AuctionResultBody;
    if (body.auctionId === auctionId) return body;
  }
  return undefined;
}

describe("AuctionSystem — Vickrey", () => {
  let world: World<GameEntity>;
  let bus: MessageBus;
  let sys: AuctionSystem;

  beforeEach(() => {
    world = new World<GameEntity>();
    bus = new MessageBus();
    spawnShopkeeper(world);
    sys = new AuctionSystem(bus, world, createRng(123));
  });

  it("with 3 bids: winner is top bid, paid = second-highest", () => {
    const cfp: AuctionCfpBody = {
      auctionId: "v1",
      type: "vickrey",
      item: "golden_bean",
      reservePrice: 10,
      closesAtTick: 5,
    };
    sys.openAuction(cfp);
    sys.submitBid({ auctionId: "v1", bidderId: 101, amount: 50 }, 1);
    sys.submitBid({ auctionId: "v1", bidderId: 102, amount: 90 }, 2);
    sys.submitBid({ auctionId: "v1", bidderId: 103, amount: 70 }, 3);

    sys.run({ tick: 5 }); 

    const res = findResult(bus, "v1");
    expect(res).toBeDefined();
    expect(res!.winnerId).toBe(102);
    expect(res!.paidPrice).toBe(70); 
    expect(res!.participants.sort()).toEqual([101, 102, 103]);
  });

  it("with 1 bid: paid = reserve price", () => {
    const cfp: AuctionCfpBody = {
      auctionId: "v2",
      type: "vickrey",
      item: "golden_bean",
      reservePrice: 25,
      closesAtTick: 4,
    };
    sys.openAuction(cfp);
    sys.submitBid({ auctionId: "v2", bidderId: 201, amount: 100 }, 1);

    sys.run({ tick: 4 });

    const res = findResult(bus, "v2");
    expect(res).toBeDefined();
    expect(res!.winnerId).toBe(201);
    expect(res!.paidPrice).toBe(25);
  });

  it("with 0 bids: no winner, paid = reserve", () => {
    const cfp: AuctionCfpBody = {
      auctionId: "v3",
      type: "vickrey",
      item: "golden_bean",
      reservePrice: 40,
      closesAtTick: 3,
    };
    sys.openAuction(cfp);
    sys.run({ tick: 3 });

    const res = findResult(bus, "v3");
    expect(res).toBeDefined();
    expect(res!.winnerId).toBeNull();
    expect(res!.paidPrice).toBe(40);
    expect(res!.participants).toEqual([]);
  });

  it("ties resolve deterministically — earliest tickReceived wins", () => {
    const cfp: AuctionCfpBody = {
      auctionId: "v4",
      type: "vickrey",
      item: "golden_bean",
      reservePrice: 5,
      closesAtTick: 10,
    };
    sys.openAuction(cfp);
    sys.submitBid({ auctionId: "v4", bidderId: 301, amount: 50 }, 2);
    sys.submitBid({ auctionId: "v4", bidderId: 302, amount: 50 }, 4);

    sys.run({ tick: 10 });

    const res = findResult(bus, "v4");
    expect(res).toBeDefined();

    expect(res!.winnerId).toBe(301);

    expect(res!.paidPrice).toBe(50);
  });

  it("ties on the SAME tick resolve by lowest bidderId (determinism hardening)", () => {
    const cfp: AuctionCfpBody = {
      auctionId: "v4b",
      type: "vickrey",
      item: "golden_bean",
      reservePrice: 5,
      closesAtTick: 10,
    };
    sys.openAuction(cfp);

    sys.submitBid({ auctionId: "v4b", bidderId: 502, amount: 60 }, 3);
    sys.submitBid({ auctionId: "v4b", bidderId: 501, amount: 60 }, 3);

    sys.run({ tick: 10 });

    const res = findResult(bus, "v4b");
    expect(res).toBeDefined();
    expect(res!.winnerId).toBe(501); 
  });

  it("top bid below reserve → no winner", () => {
    const cfp: AuctionCfpBody = {
      auctionId: "v5",
      type: "vickrey",
      item: "golden_bean",
      reservePrice: 100,
      closesAtTick: 3,
    };
    sys.openAuction(cfp);
    sys.submitBid({ auctionId: "v5", bidderId: 401, amount: 50 }, 1);
    sys.run({ tick: 3 });

    const res = findResult(bus, "v5");
    expect(res).toBeDefined();
    expect(res!.winnerId).toBeNull();
    expect(res!.paidPrice).toBe(100);
  });

  it("does not resolve before closesAtTick", () => {
    const cfp: AuctionCfpBody = {
      auctionId: "v6",
      type: "vickrey",
      item: "golden_bean",
      reservePrice: 10,
      closesAtTick: 10,
    };
    sys.openAuction(cfp);
    sys.submitBid({ auctionId: "v6", bidderId: 1, amount: 50 }, 1);
    sys.run({ tick: 5 }); 

    const res = findResult(bus, "v6");
    expect(res).toBeUndefined();
  });

  it("late bid (tick >= closesAtTick) is rejected", () => {
    const cfp: AuctionCfpBody = {
      auctionId: "v7",
      type: "vickrey",
      item: "golden_bean",
      reservePrice: 5,
      closesAtTick: 3,
    };
    sys.openAuction(cfp);
    const accepted = sys.submitBid({ auctionId: "v7", bidderId: 1, amount: 50 }, 3);
    expect(accepted).toBe(false);
  });

  it("openAuction is idempotent for an existing id", () => {
    const cfp: AuctionCfpBody = {
      auctionId: "v8",
      type: "vickrey",
      item: "golden_bean",
      reservePrice: 5,
      closesAtTick: 3,
    };
    sys.openAuction(cfp);
    sys.submitBid({ auctionId: "v8", bidderId: 1, amount: 50 }, 1);
    sys.openAuction(cfp); 
    sys.run({ tick: 3 });
    const res = findResult(bus, "v8");
    expect(res!.winnerId).toBe(1);
  });
});

describe("AuctionSystem — Dutch", () => {
  let world: World<GameEntity>;
  let bus: MessageBus;
  let sys: AuctionSystem;

  beforeEach(() => {
    world = new World<GameEntity>();
    bus = new MessageBus();
    spawnShopkeeper(world);
    sys = new AuctionSystem(bus, world, createRng(42), {
      startPrice: 100,
      decrementPerTick: 10,
      floor: 20,
    });
  });

  it("first-accept wins at the current price", () => {
    const cfp: AuctionCfpBody = {
      auctionId: "d1",
      type: "dutch",
      item: "golden_bean",
      reservePrice: 20,
      closesAtTick: 20,
    };
    sys.openAuction(cfp);

    sys.run({ tick: 0 });

    const ok = sys.submitBid({ auctionId: "d1", bidderId: 7, amount: 80 }, 3);
    expect(ok).toBe(true);

    sys.run({ tick: 3 });

    const res = findResult(bus, "d1");
    expect(res).toBeDefined();
    expect(res!.winnerId).toBe(7);
    expect(res!.paidPrice).toBe(70);
  });

  it("bid below current price does not win; later bid at lower clock wins", () => {
    const cfp: AuctionCfpBody = {
      auctionId: "d2",
      type: "dutch",
      item: "golden_bean",
      reservePrice: 20,
      closesAtTick: 20,
    };
    sys.openAuction(cfp);
    sys.run({ tick: 0 }); 

    expect(sys.submitBid({ auctionId: "d2", bidderId: 9, amount: 50 }, 1)).toBe(false);

    expect(sys.submitBid({ auctionId: "d2", bidderId: 9, amount: 50 }, 6)).toBe(true);
    sys.run({ tick: 6 });

    const res = findResult(bus, "d2");
    expect(res).toBeDefined();
    expect(res!.winnerId).toBe(9);
    expect(res!.paidPrice).toBe(40);
  });

  it("no taker before close → null winner, paid = reserve", () => {
    const cfp: AuctionCfpBody = {
      auctionId: "d3",
      type: "dutch",
      item: "golden_bean",
      reservePrice: 25,
      closesAtTick: 4,
    };
    sys.openAuction(cfp);
    sys.run({ tick: 0 });
    sys.run({ tick: 4 });

    const res = findResult(bus, "d3");
    expect(res).toBeDefined();
    expect(res!.winnerId).toBeNull();
    expect(res!.paidPrice).toBe(25);
  });

  it("clock floor clamps the price", () => {
    const cfp: AuctionCfpBody = {
      auctionId: "d4",
      type: "dutch",
      item: "golden_bean",
      reservePrice: 20,
      closesAtTick: 100,
    };
    sys.openAuction(cfp);
    sys.run({ tick: 0 });

    expect(sys.submitBid({ auctionId: "d4", bidderId: 1, amount: 20 }, 50)).toBe(true);
    sys.run({ tick: 50 });
    const res = findResult(bus, "d4");
    expect(res!.paidPrice).toBe(20);
  });
});

describe("AuctionSystem — FPSB", () => {
  let world: World<GameEntity>;
  let bus: MessageBus;
  let sys: AuctionSystem;

  beforeEach(() => {
    world = new World<GameEntity>();
    bus = new MessageBus();
    spawnShopkeeper(world);
    sys = new AuctionSystem(bus, world, createRng(7));
  });

  it("highest bid above reserve wins and pays its OWN bid", () => {
    const cfp: AuctionCfpBody = {
      auctionId: "f1",
      type: "fpsb",
      item: "golden_bean",
      reservePrice: 10,
      closesAtTick: 5,
    };
    sys.openAuction(cfp);
    sys.submitBid({ auctionId: "f1", bidderId: 101, amount: 50 }, 1);
    sys.submitBid({ auctionId: "f1", bidderId: 102, amount: 90 }, 2);
    sys.submitBid({ auctionId: "f1", bidderId: 103, amount: 70 }, 3);

    sys.run({ tick: 5 });

    const res = findResult(bus, "f1");
    expect(res).toBeDefined();
    expect(res!.winnerId).toBe(102);
    expect(res!.paidPrice).toBe(90); 
    expect(res!.participants.sort()).toEqual([101, 102, 103]);
  });

  it("top bid below reserve → no winner, paid = reserve", () => {
    const cfp: AuctionCfpBody = {
      auctionId: "f2",
      type: "fpsb",
      item: "golden_bean",
      reservePrice: 100,
      closesAtTick: 3,
    };
    sys.openAuction(cfp);
    sys.submitBid({ auctionId: "f2", bidderId: 401, amount: 50 }, 1);
    sys.run({ tick: 3 });

    const res = findResult(bus, "f2");
    expect(res).toBeDefined();
    expect(res!.winnerId).toBeNull();
    expect(res!.paidPrice).toBe(100);
  });

  it("ties resolve deterministically — earliest tickReceived then lowest id", () => {
    const cfp: AuctionCfpBody = {
      auctionId: "f3",
      type: "fpsb",
      item: "golden_bean",
      reservePrice: 5,
      closesAtTick: 10,
    };
    sys.openAuction(cfp);

    sys.submitBid({ auctionId: "f3", bidderId: 302, amount: 50 }, 2);
    sys.submitBid({ auctionId: "f3", bidderId: 301, amount: 50 }, 2);

    sys.run({ tick: 10 });

    const res = findResult(bus, "f3");
    expect(res).toBeDefined();
    expect(res!.winnerId).toBe(301); 
    expect(res!.paidPrice).toBe(50); 
  });

  it("no bids → no winner, paid = reserve", () => {
    const cfp: AuctionCfpBody = {
      auctionId: "f4",
      type: "fpsb",
      item: "golden_bean",
      reservePrice: 40,
      closesAtTick: 3,
    };
    sys.openAuction(cfp);
    sys.run({ tick: 3 });

    const res = findResult(bus, "f4");
    expect(res).toBeDefined();
    expect(res!.winnerId).toBeNull();
    expect(res!.paidPrice).toBe(40);
    expect(res!.participants).toEqual([]);
  });
});

describe("AuctionSystem — English", () => {
  let world: World<GameEntity>;
  let bus: MessageBus;
  let sys: AuctionSystem;

  beforeEach(() => {
    world = new World<GameEntity>();
    bus = new MessageBus();
    spawnShopkeeper(world);
    sys = new AuctionSystem(bus, world, createRng(99), undefined, {
      incrementPerTick: 10,
      noBidTimeout: 3,
    });
  });

  it("ascending clock — last/highest affirmer wins at the current ask", () => {
    const cfp: AuctionCfpBody = {
      auctionId: "e1",
      type: "english",
      item: "golden_bean",
      reservePrice: 20,
      closesAtTick: 50,
    };
    sys.openAuction(cfp);
    sys.run({ tick: 0 }); 

    expect(sys.submitBid({ auctionId: "e1", bidderId: 7, amount: 30 }, 1)).toBe(true);

    expect(sys.submitBid({ auctionId: "e1", bidderId: 8, amount: 40 }, 2)).toBe(true);

    expect(sys.submitBid({ auctionId: "e1", bidderId: 7, amount: 45 }, 3)).toBe(false);

    sys.run({ tick: 5 });

    const res = findResult(bus, "e1");
    expect(res).toBeDefined();
    expect(res!.winnerId).toBe(8); 
    expect(res!.paidPrice).toBe(40); 
    expect(res!.participants.sort()).toEqual([7, 8]);
  });

  it("no taker → null winner, paid = reserve", () => {
    const cfp: AuctionCfpBody = {
      auctionId: "e2",
      type: "english",
      item: "golden_bean",
      reservePrice: 25,
      closesAtTick: 4,
    };
    sys.openAuction(cfp);
    sys.run({ tick: 0 });
    sys.run({ tick: 4 });

    const res = findResult(bus, "e2");
    expect(res).toBeDefined();
    expect(res!.winnerId).toBeNull();
    expect(res!.paidPrice).toBe(25);
    expect(res!.participants).toEqual([]);
  });

  it("closes on the no-bid timeout before closesAtTick", () => {
    const cfp: AuctionCfpBody = {
      auctionId: "e3",
      type: "english",
      item: "golden_bean",
      reservePrice: 20,
      closesAtTick: 100,
    };
    sys.openAuction(cfp);
    sys.run({ tick: 0 });

    expect(sys.submitBid({ auctionId: "e3", bidderId: 5, amount: 30 }, 1)).toBe(true);

    sys.run({ tick: 3 });
    expect(findResult(bus, "e3")).toBeUndefined();

    sys.run({ tick: 4 });
    const res = findResult(bus, "e3");
    expect(res).toBeDefined();
    expect(res!.winnerId).toBe(5);
    expect(res!.paidPrice).toBe(30);
  });
});

// Insolvent-winner settlement. Before the runner-up-ladder fix, resolution
// named the highest bidder regardless of whether they could pay; the shopkeeper
// then retained the AUCTION_RESULT and retried settlement every tick forever.
// These are the red-before-fix tests: pre-fix they asserted the OLD winner and
// failed; post-fix the auction names a winner who can actually pay.
describe("AuctionSystem — insolvent-winner settlement", () => {
  let world: World<GameEntity>;
  let bus: MessageBus;
  let sys: AuctionSystem;

  beforeEach(() => {
    world = new World<GameEntity>();
    bus = new MessageBus();
    spawnShopkeeper(world);
    sys = new AuctionSystem(bus, world, createRng(5));
  });

  function spawnBidder(gold: number): number {
    const e = world.spawn({
      farmer: { name: `b${gold}`, currentRegion: "village" as const },
      inventory: { gold, crops: { ...ZERO_CROPS }, seeds: { ...ZERO_CROPS } },
    });
    return e.id!;
  }

  function goldOf(id: number): number {
    for (const e of world.query("farmer", "inventory")) {
      if (e.id === id) return e.inventory.gold;
    }
    return -1;
  }

  it("Vickrey: an insolvent top bidder is passed over to the solvent runner-up", () => {
    const poor = spawnBidder(5); // bids highest but can't cover the second price
    const rich = spawnBidder(1000); // runner-up, solvent
    const cfp: AuctionCfpBody = {
      auctionId: "ins-v",
      type: "vickrey",
      item: "golden_bean",
      reservePrice: 10,
      closesAtTick: 5,
    };
    sys.openAuction(cfp);
    sys.submitBid({ auctionId: "ins-v", bidderId: poor, amount: 100 }, 1);
    sys.submitBid({ auctionId: "ins-v", bidderId: rich, amount: 50 }, 2);
    sys.run({ tick: 5 });

    const res = findResult(bus, "ins-v");
    expect(res).toBeDefined();
    // Pre-fix this was `poor` at paid = 50 (the second price) — unpayable.
    expect(res!.winnerId).toBe(rich);
    expect(res!.paidPrice).toBe(10); // rich is last in the ladder → pays reserve
    // The named winner can actually settle: no infinite shopkeeper retry.
    expect(goldOf(res!.winnerId!)).toBeGreaterThanOrEqual(res!.paidPrice);
  });

  it("Vickrey: when every bidder is insolvent → no winner (no perpetual retry)", () => {
    const poor = spawnBidder(3);
    const cfp: AuctionCfpBody = {
      auctionId: "ins-v0",
      type: "vickrey",
      item: "golden_bean",
      reservePrice: 10,
      closesAtTick: 5,
    };
    sys.openAuction(cfp);
    sys.submitBid({ auctionId: "ins-v0", bidderId: poor, amount: 100 }, 1);
    sys.run({ tick: 5 });

    const res = findResult(bus, "ins-v0");
    expect(res).toBeDefined();
    expect(res!.winnerId).toBeNull();
    expect(res!.paidPrice).toBe(10);
    // participants still records the bidder that took part.
    expect(res!.participants).toEqual([poor]);
  });

  it("FPSB: an insolvent top bidder hands off to the runner-up at their own bid", () => {
    const poor = spawnBidder(5); // can't cover its own 100 bid
    const rich = spawnBidder(1000);
    const cfp: AuctionCfpBody = {
      auctionId: "ins-f",
      type: "fpsb",
      item: "golden_bean",
      reservePrice: 10,
      closesAtTick: 5,
    };
    sys.openAuction(cfp);
    sys.submitBid({ auctionId: "ins-f", bidderId: poor, amount: 100 }, 1);
    sys.submitBid({ auctionId: "ins-f", bidderId: rich, amount: 50 }, 2);
    sys.run({ tick: 5 });

    const res = findResult(bus, "ins-f");
    expect(res).toBeDefined();
    // Pre-fix: `poor` at 100 (unpayable). Now `rich` pays its own 50.
    expect(res!.winnerId).toBe(rich);
    expect(res!.paidPrice).toBe(50);
    expect(goldOf(res!.winnerId!)).toBeGreaterThanOrEqual(res!.paidPrice);
  });

  it("Dutch: a provably-insolvent accepter voids the sale rather than looping", () => {
    const poor = spawnBidder(5);
    sys = new AuctionSystem(bus, world, createRng(5), {
      startPrice: 100,
      decrementPerTick: 10,
      floor: 20,
    });
    const cfp: AuctionCfpBody = {
      auctionId: "ins-d",
      type: "dutch",
      item: "golden_bean",
      reservePrice: 20,
      closesAtTick: 20,
    };
    sys.openAuction(cfp);
    sys.run({ tick: 0 });
    expect(sys.submitBid({ auctionId: "ins-d", bidderId: poor, amount: 80 }, 3)).toBe(true);
    sys.run({ tick: 3 });

    const res = findResult(bus, "ins-d");
    expect(res).toBeDefined();
    // Accepter can't pay the 70 clock price → no winner, paid = reserve.
    expect(res!.winnerId).toBeNull();
    expect(res!.paidPrice).toBe(20);
  });

  it("bidders whose entity is unknown are assumed solvent (existing behaviour preserved)", () => {
    // No entities spawned for these ids → canAfford can't prove insolvency.
    const cfp: AuctionCfpBody = {
      auctionId: "unk",
      type: "vickrey",
      item: "golden_bean",
      reservePrice: 10,
      closesAtTick: 5,
    };
    sys.openAuction(cfp);
    sys.submitBid({ auctionId: "unk", bidderId: 900, amount: 100 }, 1);
    sys.submitBid({ auctionId: "unk", bidderId: 901, amount: 50 }, 2);
    sys.run({ tick: 5 });

    const res = findResult(bus, "unk");
    expect(res).toBeDefined();
    expect(res!.winnerId).toBe(900); // top bidder still wins at the second price
    expect(res!.paidPrice).toBe(50);
  });
});
