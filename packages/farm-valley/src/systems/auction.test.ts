import { describe, it, expect, beforeEach } from "vitest";
import { MessageBus, World, createRng } from "@engine/core";
import type { GameEntity } from "../components";
import { AuctionSystem } from "./auction";
import { spawnShopkeeper } from "../agents/market-wall";
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

    sys.run({ tick: 5 }); // closes inclusive at closesAtTick

    const res = findResult(bus, "v1");
    expect(res).toBeDefined();
    expect(res!.winnerId).toBe(102);
    expect(res!.paidPrice).toBe(70); // second-highest
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
    // 301 arrived first; tie-break by tickReceived → 301 wins.
    expect(res!.winnerId).toBe(301);
    // Second-highest equals top here, so paid = 50 (clamped to >= reserve).
    expect(res!.paidPrice).toBe(50);
  });

  it("ties on the SAME tick resolve by lowest bidderId (brief 24 hardening)", () => {
    const cfp: AuctionCfpBody = {
      auctionId: "v4b",
      type: "vickrey",
      item: "golden_bean",
      reservePrice: 5,
      closesAtTick: 10,
    };
    sys.openAuction(cfp);
    // Equal amount, equal tickReceived — submit higher id first so a stable
    // result can't come from insertion order; only the bidderId key decides.
    sys.submitBid({ auctionId: "v4b", bidderId: 502, amount: 60 }, 3);
    sys.submitBid({ auctionId: "v4b", bidderId: 501, amount: 60 }, 3);

    sys.run({ tick: 10 });

    const res = findResult(bus, "v4b");
    expect(res).toBeDefined();
    expect(res!.winnerId).toBe(501); // lowest bidderId wins the tie
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
    sys.run({ tick: 5 }); // before close

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
    sys.openAuction(cfp); // duplicate — should NOT reset
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
    // Need one run to anchor startTick.
    sys.run({ tick: 0 });
    // At tick 3, price = 100 - 30 = 70.
    const ok = sys.submitBid({ auctionId: "d1", bidderId: 7, amount: 80 }, 3);
    expect(ok).toBe(true);

    // Resolve on the next system run.
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
    sys.run({ tick: 0 }); // startTick = 0
    // At tick 1, price = 90. Bid of 50 rejected.
    expect(sys.submitBid({ auctionId: "d2", bidderId: 9, amount: 50 }, 1)).toBe(false);
    // At tick 6, price = 100 - 60 = 40. Bid of 50 accepted at 40.
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
    // Way past the floor — price should clamp at 20.
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
    expect(res!.paidPrice).toBe(90); // first-price: pays own bid, not second-highest
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
    // Same amount, same tick → tie-break falls through to lowest bidder id.
    sys.submitBid({ auctionId: "f3", bidderId: 302, amount: 50 }, 2);
    sys.submitBid({ auctionId: "f3", bidderId: 301, amount: 50 }, 2);

    sys.run({ tick: 10 });

    const res = findResult(bus, "f3");
    expect(res).toBeDefined();
    expect(res!.winnerId).toBe(301); // lowest id wins the tie
    expect(res!.paidPrice).toBe(50); // first-price: pays own bid
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
    sys.run({ tick: 0 }); // anchor startTick = 0

    // tick 1: ask = 20 + 10*1 = 30. Bidder 7 affirms (valuation covers it).
    expect(sys.submitBid({ auctionId: "e1", bidderId: 7, amount: 30 }, 1)).toBe(true);
    // tick 2: ask = 20 + 10*2 = 40. Bidder 8 affirms higher.
    expect(sys.submitBid({ auctionId: "e1", bidderId: 8, amount: 40 }, 2)).toBe(true);
    // tick 3: ask = 50. Bidder 7's valuation (45) no longer covers it → rejected.
    expect(sys.submitBid({ auctionId: "e1", bidderId: 7, amount: 45 }, 3)).toBe(false);

    // No affirm for noBidTimeout (3) ticks after the last bid at tick 2 → close.
    sys.run({ tick: 5 });

    const res = findResult(bus, "e1");
    expect(res).toBeDefined();
    expect(res!.winnerId).toBe(8); // last affirmer
    expect(res!.paidPrice).toBe(40); // ask at the affirming tick
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
    sys.run({ tick: 4 }); // fixed clock runs out with no affirming bid

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
      closesAtTick: 100, // far away — the timeout must drive the close
    };
    sys.openAuction(cfp);
    sys.run({ tick: 0 }); // anchor startTick = 0

    // tick 1: ask = 30. Bidder 5 affirms.
    expect(sys.submitBid({ auctionId: "e3", bidderId: 5, amount: 30 }, 1)).toBe(true);
    // No further bids. Last bid at tick 1; timeout = 3 → closes at tick 4.
    sys.run({ tick: 3 }); // 3 - 1 = 2 < 3 → still open
    expect(findResult(bus, "e3")).toBeUndefined();

    sys.run({ tick: 4 }); // 4 - 1 = 3 >= 3 → close
    const res = findResult(bus, "e3");
    expect(res).toBeDefined();
    expect(res!.winnerId).toBe(5);
    expect(res!.paidPrice).toBe(30);
  });
});
