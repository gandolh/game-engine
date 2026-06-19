import { ZERO_CROPS } from "../economy";
import { describe, expect, it, beforeEach } from "vitest";
import { MessageBus, World } from "@engine/core";
import type { GameEntity, CropKind } from "../components";
import { EncounterSystem } from "./encounter";
import { EncounterTradeSystem, OFFER_TTL_TICKS } from "./encounter-trade";
import { ONT_ENCOUNTER, type OfferSeedBody } from "../protocols/encounter";
import { PERFORMATIVE } from "../protocols/performatives";
import type { RegionId } from "../world/regions";

import "../agents/hoarder";
import "../agents/aggressive";
import "../agents/conservative";
import "../agents/opportunist";

const ZERO: Record<CropKind, number> = { ...ZERO_CROPS };

interface FarmerSpec {
  personality: "hoarder" | "aggressive" | "conservative" | "opportunist";
  region?: RegionId;
  gold?: number;
  reserve?: number;
  seeds?: Partial<Record<CropKind, number>>;
  crops?: Partial<Record<CropKind, number>>;
  day?: number;
}

function spawnFarmer(world: World<GameEntity>, spec: FarmerSpec): GameEntity {
  const defaultReserve: Record<string, number> = {
    hoarder: 80,
    aggressive: 10,
    conservative: 30,
    opportunist: 50,
  };
  return world.spawn({
    farmer: { name: spec.personality, currentRegion: spec.region ?? "village" },
    personality: { kind: spec.personality },
    inbox: { messages: [] },
    beliefs: { data: { currentDay: spec.day ?? 1 }, revision: 0 },
    desires: { data: { minGoldReserve: spec.reserve ?? defaultReserve[spec.personality] } },
    intentions: { queue: [] },
    inventory: {
      gold: spec.gold ?? 200,
      crops: { ...ZERO, ...spec.crops },
      seeds: { ...ZERO, ...spec.seeds },
    },
  });
}

function inboxOf(e: GameEntity, ontology: string): unknown[] {
  return e.inbox!.messages.filter((m) => m.ontology === ontology);
}

describe("EncounterTradeSystem", () => {
  let world: World<GameEntity>;
  let bus: MessageBus;
  let encounter: EncounterSystem;
  let trade: EncounterTradeSystem;

  beforeEach(() => {
    world = new World<GameEntity>();
    bus = new MessageBus();
    encounter = new EncounterSystem(world, bus);
    trade = new EncounterTradeSystem(world);
  });

  it("Hoarder declines an OFFER_SEED that breaches her seed buffer", () => {

    const hannah = spawnFarmer(world, {
      personality: "hoarder",
      gold: 200,
      reserve: 80,
      seeds: { radish: 3 },
    });
    const atticus = spawnFarmer(world, {
      personality: "aggressive",
      gold: 100,
      seeds: { radish: 0 },
    });

    const offer: OfferSeedBody = {
      offerId: "buffer-1",
      crop: "radish",
      quantity: 2,
      unitPrice: 5,
      direction: "buy",
    };
    hannah.inbox!.messages.push({
      performative: PERFORMATIVE.PROPOSE,
      ontology: ONT_ENCOUNTER.OFFER_SEED,
      sender: atticus.id!,
      body: offer as unknown as Record<string, unknown>,
      tickIssued: 1,
    });

    trade.run({ tick: 1 });

    const declines = inboxOf(atticus, ONT_ENCOUNTER.DECLINE);
    expect(declines).toHaveLength(1);
  });

  it("MEET → OFFER_SEED → ACCEPT transfers seeds + gold (sell direction injected)", () => {

    const atticus = spawnFarmer(world, {
      personality: "aggressive",
      gold: 100,
      seeds: { wheat: 5 },
    });
    const otto = spawnFarmer(world, {
      personality: "opportunist",
      gold: 200,
      reserve: 50,
      seeds: { wheat: 0 },
    });

    const offer: OfferSeedBody = {
      offerId: "manual-1",
      crop: "wheat",
      quantity: 2,
      unitPrice: 8,
      direction: "sell",
    };
    otto.inbox!.messages.push({
      performative: PERFORMATIVE.PROPOSE,
      ontology: ONT_ENCOUNTER.OFFER_SEED,
      sender: atticus.id!,
      body: offer as unknown as Record<string, unknown>,
      tickIssued: 1,
    });

    trade.run({ tick: 1 });

    expect(atticus.inventory!.gold).toBe(116);
    expect(atticus.inventory!.seeds.wheat).toBe(3);
    expect(otto.inventory!.gold).toBe(184);
    expect(otto.inventory!.seeds.wheat).toBe(2);
  });

  it("MEET → OFFER_SEED → ACCEPT transfers when buy direction is initiated", () => {

    const hannah = spawnFarmer(world, {
      personality: "hoarder",
      gold: 200,
      reserve: 80,
      seeds: { radish: 0 },
    });
    const atticus = spawnFarmer(world, {
      personality: "aggressive",
      gold: 100,
      seeds: { radish: 5 },
    });

    const offer: OfferSeedBody = {
      offerId: "manual-buy",
      crop: "radish",
      quantity: 2,
      unitPrice: 8,
      direction: "buy",
    };
    atticus.inbox!.messages.push({
      performative: PERFORMATIVE.PROPOSE,
      ontology: ONT_ENCOUNTER.OFFER_SEED,
      sender: hannah.id!,
      body: offer as unknown as Record<string, unknown>,
      tickIssued: 2,
    });

    trade.run({ tick: 2 });

    expect(hannah.inventory!.gold).toBe(184);
    expect(hannah.inventory!.seeds.radish).toBe(2);
    expect(atticus.inventory!.gold).toBe(116);
    expect(atticus.inventory!.seeds.radish).toBe(3);
  });

  it("declines on overprice — no transfer", () => {
    const cora = spawnFarmer(world, {
      personality: "conservative",
      gold: 200,
      seeds: { radish: 10 },
    });
    const goldBefore = cora.inventory!.gold;
    const seedsBefore = cora.inventory!.seeds.radish;

    const offer: OfferSeedBody = {
      offerId: "rip",
      crop: "radish",
      quantity: 1,
      unitPrice: 100,
      direction: "sell",
    };
    cora.inbox!.messages.push({
      performative: PERFORMATIVE.PROPOSE,
      ontology: ONT_ENCOUNTER.OFFER_SEED,
      sender: 9999,
      body: offer as unknown as Record<string, unknown>,
      tickIssued: 1,
    });

    trade.run({ tick: 1 });
    expect(cora.inventory!.gold).toBe(goldBefore);
    expect(cora.inventory!.seeds.radish).toBe(seedsBefore);
  });

  it("declines when buying would breach reserve", () => {
    const cora = spawnFarmer(world, {
      personality: "conservative",
      gold: 35,
      reserve: 30,
      seeds: { pumpkin: 0 },
    });

    const offer: OfferSeedBody = {
      offerId: "tight",
      crop: "pumpkin",
      quantity: 5,
      unitPrice: 30,
      direction: "sell",
    };
    cora.inbox!.messages.push({
      performative: PERFORMATIVE.PROPOSE,
      ontology: ONT_ENCOUNTER.OFFER_SEED,
      sender: 9999,
      body: offer as unknown as Record<string, unknown>,
      tickIssued: 1,
    });

    trade.run({ tick: 1 });
    expect(cora.inventory!.gold).toBe(35);
    expect(cora.inventory!.seeds.pumpkin).toBe(0);
  });

  it("transfer is silently skipped if seller no longer has stock when ACCEPT arrives", () => {

    const hannah = spawnFarmer(world, {
      personality: "hoarder",
      gold: 200,
      reserve: 80,
      seeds: { radish: 0 },
    });
    const atticus = spawnFarmer(world, {
      personality: "aggressive",
      gold: 100,
      seeds: { radish: 5 },
    });

    const offer: OfferSeedBody = {
      offerId: "race",
      crop: "radish",
      quantity: 2,
      unitPrice: 8,
      direction: "buy",
    };
    atticus.inbox!.messages.push({
      performative: PERFORMATIVE.PROPOSE,
      ontology: ONT_ENCOUNTER.OFFER_SEED,
      sender: hannah.id!,
      body: offer as unknown as Record<string, unknown>,
      tickIssued: 3,
    });
    atticus.inventory!.seeds.radish = 0;

    trade.run({ tick: 3 });

    expect(hannah.inventory!.gold).toBe(200);
    expect(hannah.inventory!.seeds.radish).toBe(0);
    expect(atticus.inventory!.gold).toBe(100);
  });

  it("clears pending map on decline (short-circuit)", () => {
    const hannah = spawnFarmer(world, {
      personality: "hoarder",
      gold: 200,
      reserve: 80,
      seeds: { radish: 0 },
    });
    spawnFarmer(world, { personality: "aggressive", gold: 100, seeds: { radish: 5 } });

    encounter.run({ tick: 1 });
    trade.run({ tick: 1 });

    void hannah;
    expect(trade._pendingOfferCount()).toBe(0);
  });

  it("only the lower-id farmer's MEET triggers initiate (prevents double-offer)", () => {

    const lo = spawnFarmer(world, {
      personality: "hoarder",
      gold: 200,
      reserve: 80,
      seeds: { radish: 0 },
    });
    const hi = spawnFarmer(world, {
      personality: "hoarder",
      gold: 200,
      reserve: 80,
      seeds: { radish: 0 },
    });

    encounter.run({ tick: 1 });
    trade.run({ tick: 1 });

    const loEncMsgs = lo.inbox!.messages.filter((m) =>
      ([ONT_ENCOUNTER.ACCEPT, ONT_ENCOUNTER.DECLINE] as string[]).includes(m.ontology),
    );
    const hiEncMsgs = hi.inbox!.messages.filter((m) =>
      ([ONT_ENCOUNTER.ACCEPT, ONT_ENCOUNTER.DECLINE] as string[]).includes(m.ontology),
    );
    expect(loEncMsgs.length + hiEncMsgs.length).toBe(1);
  });

  it("consumes encounter messages from inbox (PerceiveSystem won't see them)", () => {
    const hannah = spawnFarmer(world, {
      personality: "hoarder",
      gold: 200,
      reserve: 80,
      seeds: { radish: 0 },
    });
    spawnFarmer(world, { personality: "aggressive", gold: 100, seeds: { radish: 5 } });

    encounter.run({ tick: 1 });

    expect(
      hannah.inbox!.messages.some((m) => m.ontology === ONT_ENCOUNTER.MEET),
    ).toBe(true);

    trade.run({ tick: 1 });

    expect(
      hannah.inbox!.messages.some((m) => m.ontology === ONT_ENCOUNTER.MEET),
    ).toBe(false);
  });

  it("acceptor records +acceptDelta trust toward the sender when accepting OFFER_SEED", () => {

    const hannah = spawnFarmer(world, {
      personality: "hoarder",
      gold: 200,
      seeds: { wheat: 5 },
    });
    const atticus = spawnFarmer(world, {
      personality: "aggressive",
      gold: 100,
      seeds: { wheat: 0 },
    });

    const offer: OfferSeedBody = {
      offerId: "trust-test-1",
      crop: "wheat",
      quantity: 1,
      unitPrice: 7,
      direction: "sell",
    };
    atticus.inbox!.messages.push({
      performative: PERFORMATIVE.PROPOSE,
      ontology: ONT_ENCOUNTER.OFFER_SEED,
      sender: hannah.id!,
      body: offer as unknown as Record<string, unknown>,
      tickIssued: 1,
    });

    trade.run({ tick: 1 });

    expect(atticus.trust?.byId.get(hannah.id!)).toBe(0.55);
  });

  it("declines do NOT bump trust on the responder side", () => {

    const hannah = spawnFarmer(world, {
      personality: "hoarder",
      gold: 200,
      seeds: { wheat: 5 },
    });
    const atticus = spawnFarmer(world, {
      personality: "aggressive",
      gold: 100,
      seeds: { wheat: 0 },
    });

    const offer: OfferSeedBody = {
      offerId: "trust-decline-1",
      crop: "wheat",
      quantity: 1,
      unitPrice: 14,
      direction: "sell",
    };
    atticus.inbox!.messages.push({
      performative: PERFORMATIVE.PROPOSE,
      ontology: ONT_ENCOUNTER.OFFER_SEED,
      sender: hannah.id!,
      body: offer as unknown as Record<string, unknown>,
      tickIssued: 1,
    });

    trade.run({ tick: 1 });

    expect(atticus.trust?.byId.get(hannah.id!)).toBeUndefined();
  });

  it("expires unresolved pending offers after OFFER_TTL_TICKS", () => {
    const staleOffer: OfferSeedBody = {
      offerId: "stale-1",
      crop: "wheat",
      quantity: 1,
      unitPrice: 14,
      direction: "buy",
    };
    trade._seedPendingForTests({
      offerId: staleOffer.offerId,
      senderId: 1,
      recipientId: 2,
      tick: 10,
      offer: staleOffer,
    });
    expect(trade._pendingOfferCount()).toBe(1);

    trade.run({ tick: 10 + OFFER_TTL_TICKS });
    expect(trade._pendingOfferCount()).toBe(1);

    trade.run({ tick: 10 + OFFER_TTL_TICKS + 1 });
    expect(trade._pendingOfferCount()).toBe(0);
  });

  describe("crop trades (OFFER_CROP)", () => {
    it("MEET → OFFER_CROP → ACCEPT transfers crops + gold and bumps trust both ways", () => {

      const hannah = spawnFarmer(world, {
        personality: "hoarder",
        gold: 200,
        reserve: 80,
        crops: { wheat: 6 }, 
      });
      const otto = spawnFarmer(world, {
        personality: "opportunist",
        gold: 200,
        reserve: 50,
        crops: { wheat: 0 },
      });

      encounter.run({ tick: 1 });
      trade.run({ tick: 1 });

      expect(hannah.inventory!.crops.wheat).toBe(4);
      expect(otto.inventory!.crops.wheat).toBe(2);
      expect(hannah.inventory!.gold).toBeCloseTo(228.5, 5);
      expect(otto.inventory!.gold).toBeCloseTo(171.5, 5);

      expect(otto.trust?.byId.get(hannah.id!)).toBe(0.55);
    });

    it("does not move seeds when trading crops", () => {
      const hannah = spawnFarmer(world, {
        personality: "hoarder",
        gold: 200,
        reserve: 80,
        crops: { wheat: 6 },
        seeds: { wheat: 3 },
      });
      const otto = spawnFarmer(world, {
        personality: "opportunist",
        gold: 200,
        reserve: 50,
      });

      encounter.run({ tick: 1 });
      trade.run({ tick: 1 });

      expect(hannah.inventory!.seeds.wheat).toBe(3);
      expect(otto.inventory!.seeds.wheat).toBe(0);
    });

    it("a personality without respondCrop declines crop offers", () => {

      const seller = spawnFarmer(world, { personality: "opportunist", crops: { wheat: 5 } });
      const hoarder = spawnFarmer(world, { personality: "hoarder", gold: 200 });
      const offer: OfferSeedBody = {
        offerId: "crop-1",
        crop: "wheat",
        quantity: 2,
        unitPrice: 13.3,
        direction: "sell",
      };
      hoarder.inbox!.messages.push({
        performative: PERFORMATIVE.PROPOSE,
        ontology: ONT_ENCOUNTER.OFFER_CROP,
        sender: seller.id!,
        body: offer as unknown as Record<string, unknown>,
        tickIssued: 1,
      });

      trade.run({ tick: 1 });

      const declines = inboxOf(seller, ONT_ENCOUNTER.DECLINE) as Array<{
        body: { reason?: string };
      }>;
      expect(declines).toHaveLength(1);
      expect(declines[0]!.body.reason).toBe("no-crop-responder");
    });
  });
});
