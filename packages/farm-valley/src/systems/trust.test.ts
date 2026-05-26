import { describe, it, expect, beforeEach } from "vitest";
import { World } from "@engine/core";
import type { GameEntity } from "../components";
import { TrustSystem, applyTrustDelta, DEFAULT_TRUST_CONFIG } from "./trust";
import { ONT_ENCOUNTER } from "../protocols/encounter";
import { ONT_MARKET } from "../protocols/market";
import { PERFORMATIVE } from "../protocols";
import { CnpCoordinator } from "../agents/cnp-coordinator";
import type { RegionId } from "../world/regions";

function makeFarmer(world: World<GameEntity>, region: RegionId = "village"): GameEntity {
  return world.spawn({
    farmer: { name: "F", currentRegion: region },
    inbox: { messages: [] },
  });
}

function makeMarketWall(world: World<GameEntity>): GameEntity {
  return world.spawn({
    marketWall: { isMarketWall: true },
    inbox: { messages: [] },
  });
}

function push(entity: GameEntity, ontology: string, sender: number | "world", body: Record<string, unknown> = {}): void {
  entity.inbox!.messages.push({
    performative: PERFORMATIVE.INFORM,
    ontology,
    sender,
    body,
    tickIssued: 0,
  });
}

describe("TrustSystem", () => {
  let world: World<GameEntity>;

  beforeEach(() => {
    world = new World<GameEntity>();
  });

  it("applies +acceptDelta on ENCOUNTER.ACCEPT in farmer inbox", () => {
    const me = makeFarmer(world);
    const peer = makeFarmer(world);
    push(me, ONT_ENCOUNTER.ACCEPT, peer.id!);

    new TrustSystem(world).run({ tick: 0 });

    expect(me.trust!.byId.get(peer.id!)).toBeCloseTo(0.55, 6);
  });

  it("applies -declineDelta on ENCOUNTER.DECLINE in farmer inbox", () => {
    const me = makeFarmer(world);
    const peer = makeFarmer(world);
    push(me, ONT_ENCOUNTER.DECLINE, peer.id!);

    new TrustSystem(world).run({ tick: 0 });

    expect(me.trust!.byId.get(peer.id!)).toBeCloseTo(0.45, 6);
  });

  it("clamps trust above 1", () => {
    const me = makeFarmer(world);
    const peer = makeFarmer(world);
    me.trust = { byId: new Map([[peer.id!, 0.98]]) };
    push(me, ONT_ENCOUNTER.ACCEPT, peer.id!);

    new TrustSystem(world).run({ tick: 0 });

    expect(me.trust.byId.get(peer.id!)).toBe(1);
  });

  it("clamps trust below 0", () => {
    const me = makeFarmer(world);
    const peer = makeFarmer(world);
    me.trust = { byId: new Map([[peer.id!, 0.05]]) };
    push(me, ONT_ENCOUNTER.DECLINE, peer.id!);

    new TrustSystem(world).run({ tick: 0 });

    expect(me.trust.byId.get(peer.id!)).toBe(0);
  });

  it("ignores messages with non-numeric sender", () => {
    const me = makeFarmer(world);
    me.inbox!.messages.push({
      performative: PERFORMATIVE.INFORM,
      ontology: ONT_ENCOUNTER.ACCEPT,
      sender: "world",
      body: {},
      tickIssued: 0,
    });

    new TrustSystem(world).run({ tick: 0 });

    expect(me.trust).toBeUndefined();
  });

  it("applies +tradeDelta from market wall TRADE_COMPLETED to buyer toward seller", () => {
    const buyer = makeFarmer(world);
    const wall = makeMarketWall(world);
    const sellerId = 999;
    wall.inbox!.messages.push({
      performative: PERFORMATIVE.INFORM,
      ontology: ONT_MARKET.TRADE_COMPLETED,
      sender: "world",
      body: { offerId: "o1", buyerId: buyer.id, sellerId },
      tickIssued: 0,
    });

    new TrustSystem(world).run({ tick: 0 });

    expect(buyer.trust!.byId.get(sellerId)).toBeCloseTo(0.55, 6);
  });

  it("does not crash when TRADE_COMPLETED body lacks buyerId/sellerId", () => {
    const wall = makeMarketWall(world);
    wall.inbox!.messages.push({
      performative: PERFORMATIVE.INFORM,
      ontology: ONT_MARKET.TRADE_COMPLETED,
      sender: "world",
      body: { offerId: "o1" },
      tickIssued: 0,
    });

    expect(() => new TrustSystem(world).run({ tick: 0 })).not.toThrow();
  });

  it("applies -brokenDelta from CNP broken commitment past commitment window", () => {
    const initiator = makeFarmer(world);
    const winner = makeFarmer(world);
    const coord = new CnpCoordinator();
    coord.startTask({
      taskId: "t1",
      initiatorId: initiator.id!,
      buyCrop: "radish",
      quantity: 2,
      maxPricePerUnit: 8,
      deadlineTick: 5,
    });
    coord.acceptProposal("t1", { bidderId: winner.id!, pricePerUnit: 7, quantity: 2 });
    coord.closeTask("t1", 5);

    const coords = new Map<number, CnpCoordinator>([[initiator.id!, coord]]);
    const window = DEFAULT_TRUST_CONFIG.brokenCommitmentWindow;
    new TrustSystem(world, coords).run({ tick: 5 + window });

    expect(initiator.trust!.byId.get(winner.id!)).toBeCloseTo(0.4, 6);
  });

  it("does not double-apply broken-commitment delta on subsequent ticks", () => {
    const initiator = makeFarmer(world);
    const winner = makeFarmer(world);
    const coord = new CnpCoordinator();
    coord.startTask({
      taskId: "t1",
      initiatorId: initiator.id!,
      buyCrop: "radish",
      quantity: 2,
      maxPricePerUnit: 8,
      deadlineTick: 5,
    });
    coord.acceptProposal("t1", { bidderId: winner.id!, pricePerUnit: 7, quantity: 2 });
    coord.closeTask("t1", 5);

    const coords = new Map<number, CnpCoordinator>([[initiator.id!, coord]]);
    const sys = new TrustSystem(world, coords);
    const window = DEFAULT_TRUST_CONFIG.brokenCommitmentWindow;
    sys.run({ tick: 5 + window });
    sys.run({ tick: 5 + window + 1 });

    expect(initiator.trust!.byId.get(winner.id!)).toBeCloseTo(0.4, 6);
  });

  it("lazy-inits farmer.trust when absent", () => {
    const me = makeFarmer(world);
    const peer = makeFarmer(world);
    expect(me.trust).toBeUndefined();
    push(me, ONT_ENCOUNTER.ACCEPT, peer.id!);

    new TrustSystem(world).run({ tick: 0 });

    expect(me.trust).toBeDefined();
    expect(me.trust!.byId.get(peer.id!)).toBeCloseTo(0.55, 6);
  });

  it("applyTrustDelta is exported and works standalone with clamping", () => {
    const me = makeFarmer(world);
    applyTrustDelta(me, 42, 0.3);
    expect(me.trust!.byId.get(42)).toBeCloseTo(0.8, 6);
    applyTrustDelta(me, 42, 0.5);
    expect(me.trust!.byId.get(42)).toBe(1);
    applyTrustDelta(me, 42, -2);
    expect(me.trust!.byId.get(42)).toBe(0);
  });
});
