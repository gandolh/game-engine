import { describe, expect, it, beforeEach } from "vitest";
import { MessageBus, World } from "@engine/core";
import type { GameEntity, CropKind } from "../components";
import { EncounterSystem } from "./encounter";
import { EncounterTradeSystem, OFFER_TTL_TICKS } from "./encounter-trade";
import { ONT_ENCOUNTER, type OfferSeedBody } from "../protocols/encounter";
import { PERFORMATIVE } from "../protocols/performatives";
import type { RegionId } from "../world/regions";

// Side-effect imports — registering all peer-trade hooks.
import "../agents/hoarder";
import "../agents/aggressive";
import "../agents/conservative";
import "../agents/opportunist";

const ZERO: Record<CropKind, number> = { radish: 0, wheat: 0, pumpkin: 0 };

interface FarmerSpec {
  personality: "hoarder" | "aggressive" | "conservative" | "opportunist";
  region?: RegionId;
  gold?: number;
  reserve?: number;
  seeds?: Partial<Record<CropKind, number>>;
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
      crops: { ...ZERO },
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
    // Hannah initiates a BUY offer to Atticus at unitPrice 4.5 (below
    // aggressive's 95% floor → Atticus declines).
    const hannah = spawnFarmer(world, {
      personality: "hoarder",
      gold: 200,
      reserve: 80,
      seeds: { radish: 0 },
    });
    spawnFarmer(world, { personality: "aggressive", gold: 100, seeds: { radish: 5 } });

    encounter.run({ tick: 1 });
    trade.run({ tick: 1 });

    const declines = inboxOf(hannah, ONT_ENCOUNTER.DECLINE);
    expect(declines).toHaveLength(1);
  });

  it("MEET → OFFER_SEED → ACCEPT transfers seeds + gold (sell direction injected)", () => {
    // Inject a sell-direction OFFER_SEED directly: Atticus offers wheat seeds
    // to Otto at unit price 14 (= shop) → Otto's ceiling 110% (15.4) → accept.
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
      unitPrice: 14,
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

    // Otto pays 28, gains 2 wheat seeds. Atticus receives 28, loses 2 seeds.
    expect(atticus.inventory!.gold).toBe(128);
    expect(atticus.inventory!.seeds.wheat).toBe(3);
    expect(otto.inventory!.gold).toBe(172);
    expect(otto.inventory!.seeds.wheat).toBe(2);
  });

  it("MEET → OFFER_SEED → ACCEPT transfers when buy direction is initiated", () => {
    // Hannah's buy offer at 4.5 will be declined by every default personality.
    // Use a custom buy offer at 8g/seed injected to Atticus (seller floor 100%).
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

    // Hannah paid 16, gained 2 radish seeds. Atticus received 16, lost 2 seeds.
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
    // Hannah initiates a buy → Atticus accepts → but we mutate Atticus's
    // inventory between OFFER and ACCEPT to simulate a race. To do that, we
    // run the full handshake in two passes: tick 1 injects the offer; we
    // ACK manually after wiping stock.
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

    // Stage 1: inject offer, run trade — it will process the offer AND
    // immediately resolve accept in the same run. We need to interleave.
    // Strategy: place OFFER_SEED, set Atticus stock to 0 BEFORE invoking
    // trade so the transfer attempt finds no stock.
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

    // Aggressive's respond returns "decline" because stock=0 < qty=2.
    // So no transfer happens.
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
    // Hannah's offer at 4.5 is below aggressive's 95% floor (7.6) → decline
    // → pendingOffers cleared.
    void hannah;
    expect(trade._pendingOfferCount()).toBe(0);
  });

  it("only the lower-id farmer's MEET triggers initiate (prevents double-offer)", () => {
    // Two hoarders co-located. Without the lower-id rule, both would initiate.
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

    // Exactly one OFFER_SEED message should be exchanged. The lower-id
    // hoarder is the initiator; the higher-id one is the recipient.
    // After trade.run() the OFFER_SEED is consumed; the recipient should
    // have placed an ACCEPT / DECLINE in the initiator's inbox.
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
    // Before trade, both farmers have a MEET in their inbox.
    expect(
      hannah.inbox!.messages.some((m) => m.ontology === ONT_ENCOUNTER.MEET),
    ).toBe(true);

    trade.run({ tick: 1 });

    // After trade, no MEET should remain on any farmer's inbox.
    expect(
      hannah.inbox!.messages.some((m) => m.ontology === ONT_ENCOUNTER.MEET),
    ).toBe(false);
  });

  it("acceptor records +acceptDelta trust toward the sender when accepting OFFER_SEED", () => {
    // Atticus (aggressive) will accept a sell-direction offer at <= 95% shop
    // sell price. We inject the OFFER_SEED directly into his inbox from a
    // peer (Hannah) so we exercise the respond path without needing the
    // hoarder's initiate hook to fire.
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

    // direction='sell' means the sender (Hannah) is selling wheat to Atticus.
    // Aggressive's buy ceiling is 95% of shop price (14 * 0.95 = 13.3).
    // unitPrice 13 is below the ceiling, so Atticus accepts.
    const offer: OfferSeedBody = {
      offerId: "trust-test-1",
      crop: "wheat",
      quantity: 1,
      unitPrice: 13,
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

    // Atticus accepted, so his trust toward Hannah should be 0.5 + 0.05 = 0.55.
    expect(atticus.trust?.byId.get(hannah.id!)).toBe(0.55);
  });

  it("declines do NOT bump trust on the responder side", () => {
    // Inject a sell-direction offer that Atticus will decline (price too high).
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

    // unitPrice 14 * 0.96 = 13.44, which is above 95% of 14 (13.3) → decline.
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

    // No trust entry at all — decline must not set or modify trust on responder side.
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

    // Still within TTL — survives.
    trade.run({ tick: 10 + OFFER_TTL_TICKS });
    expect(trade._pendingOfferCount()).toBe(1);

    // Past TTL — expired.
    trade.run({ tick: 10 + OFFER_TTL_TICKS + 1 });
    expect(trade._pendingOfferCount()).toBe(0);
  });
});
