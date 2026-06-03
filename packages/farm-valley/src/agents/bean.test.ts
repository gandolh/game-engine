import { describe, it, expect, beforeEach } from "vitest";
import { World, MessageBus, createRng } from "@engine/core";
import type { GameEntity } from "../components";
import { expectedBeanBid, deliberateBean, RESALE_MULTIPLIER } from "./bean-valuation";
import type { AuctionCfpBody } from "../protocols/shop";
import { EncounterTradeSystem } from "../systems/encounter-trade";
import { ONT_ENCOUNTER, type OfferBeanBody } from "../protocols/encounter";
import { PERFORMATIVE } from "../protocols/performatives";
// Register hooks (side-effect imports) so the gift handshake resolves.
import "./aggressive";
import "./conservative";

const ZERO = { radish: 0, wheat: 0, pumpkin: 0 } as const;

function openCfp(reservePrice = 50): AuctionCfpBody {
  return {
    auctionId: "gb-1",
    type: "vickrey",
    item: "golden_bean",
    reservePrice,
    closesAtTick: 100,
  };
}

function makeFarmer(over: {
  gold?: number;
  reserve?: number;
  beans?: number;
  openAuction?: AuctionCfpBody;
}): GameEntity {
  return {
    beliefs: { data: { openAuction: over.openAuction }, revision: 0 },
    desires: { data: { minGoldReserve: over.reserve ?? 0 } },
    intentions: { queue: [] },
    inventory: {
      gold: over.gold ?? 1000,
      crops: { ...ZERO },
      seeds: { ...ZERO },
      goldenBeans: over.beans ?? 0,
    },
  };
}

describe("expectedBeanBid", () => {
  it("scales the bid by the personality value factor, floored at reserve", () => {
    const f = makeFarmer({ gold: 1000, reserve: 0, openAuction: openCfp(50) });
    const resale = 50 * RESALE_MULTIPLIER; // 150
    const aggressive = expectedBeanBid(f, openCfp(50), { valueFactor: 0.95 });
    const conservative = expectedBeanBid(f, openCfp(50), { valueFactor: 0.45 });
    expect(aggressive).toBe(Math.round(resale * 0.95)); // 143
    expect(conservative).toBe(Math.max(50, Math.round(resale * 0.45))); // 68
    expect(aggressive!).toBeGreaterThan(conservative!);
  });

  it("returns null when the farmer can't meet the reserve without breaching its gold reserve", () => {
    const f = makeFarmer({ gold: 60, reserve: 30, openAuction: openCfp(50) });
    // affordable = 60 - 30 = 30 < reserve 50 → no bid
    expect(expectedBeanBid(f, openCfp(50), { valueFactor: 0.95 })).toBeNull();
  });

  it("caps the bid at what the farmer can afford", () => {
    const f = makeFarmer({ gold: 90, reserve: 0, openAuction: openCfp(50) });
    // target would be 143 but affordable is only 90
    expect(expectedBeanBid(f, openCfp(50), { valueFactor: 0.95 })).toBe(90);
  });
});

describe("deliberateBean", () => {
  it("pushes an auction-bid intention when an auction is open", () => {
    const f = makeFarmer({ gold: 1000, openAuction: openCfp(50) });
    deliberateBean(f, 0.95);
    const bid = f.intentions!.queue.find((i) => i.kind === "auction-bid");
    expect(bid).toBeDefined();
    expect(bid!.data.auctionId).toBe("gb-1");
    expect(bid!.data.amount).toBe(143);
  });

  it("pushes a resale-bean intention when holding beans (resell on by default)", () => {
    const f = makeFarmer({ beans: 2 });
    deliberateBean(f, 0.7);
    const resale = f.intentions!.queue.find((i) => i.kind === "resale-bean");
    expect(resale).toBeDefined();
    expect(resale!.data.quantity).toBe(2);
  });

  it("does NOT resell when resell:false (hoarder holds)", () => {
    const f = makeFarmer({ beans: 2 });
    deliberateBean(f, 0.9, { resell: false });
    expect(f.intentions!.queue.find((i) => i.kind === "resale-bean")).toBeUndefined();
  });
});

describe("golden-bean gift handshake (EncounterTradeSystem)", () => {
  let world: World<GameEntity>;
  let trade: EncounterTradeSystem;

  beforeEach(() => {
    world = new World<GameEntity>();
    new MessageBus(); // not needed by trade.run but mirrors other tests
    trade = new EncounterTradeSystem(world);
  });

  function spawnFarmer(personality: string, beans: number): GameEntity {
    return world.spawn({
      farmer: { name: personality, currentRegion: "village" },
      personality: { kind: personality },
      inbox: { messages: [] },
      beliefs: { data: { currentDay: 1 }, revision: 0 },
      desires: { data: { minGoldReserve: 10 } },
      intentions: { queue: [] },
      inventory: { gold: 200, crops: { ...ZERO }, seeds: { ...ZERO }, goldenBeans: beans },
    });
  }

  it("transfers a gifted bean and applies a large trust delta receiver→giver", () => {
    const giver = spawnFarmer("aggressive", 1);
    const receiver = spawnFarmer("conservative", 0);

    const gift: OfferBeanBody = { offerId: "bean-x", quantity: 1 };
    receiver.inbox!.messages.push({
      performative: PERFORMATIVE.PROPOSE,
      ontology: ONT_ENCOUNTER.OFFER_BEAN,
      sender: giver.id!,
      body: gift as unknown as Record<string, unknown>,
      tickIssued: 1,
    });

    trade.run({ tick: 1 });

    expect(giver.inventory!.goldenBeans).toBe(0);
    expect(receiver.inventory!.goldenBeans).toBe(1);
    // Receiver's trust toward giver jumped well above the 0.5 baseline.
    expect(receiver.trust!.byId.get(giver.id!)!).toBeGreaterThan(0.6);
  });

  it("is a no-op if the giver has no bean to give", () => {
    const giver = spawnFarmer("aggressive", 0);
    const receiver = spawnFarmer("conservative", 0);
    receiver.inbox!.messages.push({
      performative: PERFORMATIVE.PROPOSE,
      ontology: ONT_ENCOUNTER.OFFER_BEAN,
      sender: giver.id!,
      body: { offerId: "bean-y", quantity: 1 } as unknown as Record<string, unknown>,
      tickIssued: 1,
    });
    trade.run({ tick: 1 });
    expect(receiver.inventory!.goldenBeans).toBe(0);
    expect(receiver.trust?.byId.get(giver.id!)).toBeUndefined();
  });
});

// Keep createRng import used (mirrors other test files that seed deterministically).
void createRng;
