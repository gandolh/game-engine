import { describe, it, expect, beforeEach } from "vitest";
import { MessageBus, World } from "@engine/core";
import type { GameEntity } from "../../components";
import { EncounterSystem, MEET_COOLDOWN_TICKS } from "./encounter";
import { ONT_ENCOUNTER, type MeetBody } from "../../protocols/encounter";
import type { RegionId } from "../../world/regions";

function makeFarmer(world: World<GameEntity>, region: RegionId, name = "F"): GameEntity {
  return world.spawn({
    farmer: { name, currentRegion: region },
    inbox: { messages: [] },
  });
}

function meetMessages(entity: GameEntity): MeetBody[] {
  return entity.inbox!.messages
    .filter((m) => m.ontology === ONT_ENCOUNTER.MEET)
    .map((m) => m.body as unknown as MeetBody);
}

describe("EncounterSystem", () => {
  let world: World<GameEntity>;
  let bus: MessageBus;
  let sys: EncounterSystem;

  beforeEach(() => {
    world = new World<GameEntity>();
    bus = new MessageBus();
    sys = new EncounterSystem(world, bus);
  });

  it("emits MEET to both farmers when two are co-located", () => {
    const a = makeFarmer(world, "village", "A");
    const b = makeFarmer(world, "village", "B");
    sys.run({ tick: 0 });

    const am = meetMessages(a);
    const bm = meetMessages(b);
    expect(am).toHaveLength(1);
    expect(bm).toHaveLength(1);
    expect(am[0]!.peerId).toBe(b.id);
    expect(am[0]!.regionId).toBe("village");
    expect(bm[0]!.peerId).toBe(a.id);
    expect(bm[0]!.regionId).toBe("village");
  });

  it("does not emit MEET when a farmer is alone in a region", () => {
    const a = makeFarmer(world, "village", "A");

    makeFarmer(world, "farm-cora", "B");
    sys.run({ tick: 0 });
    expect(meetMessages(a)).toHaveLength(0);
  });

  it("suppresses re-emit within MEET_COOLDOWN_TICKS, then re-emits afterwards", () => {
    const a = makeFarmer(world, "village", "A");
    const b = makeFarmer(world, "village", "B");

    sys.run({ tick: 0 });
    expect(meetMessages(a)).toHaveLength(1);

    sys.run({ tick: MEET_COOLDOWN_TICKS });
    expect(meetMessages(a)).toHaveLength(1);
    expect(meetMessages(b)).toHaveLength(1);

    sys.run({ tick: MEET_COOLDOWN_TICKS + 1 });
    expect(meetMessages(a)).toHaveLength(2);
    expect(meetMessages(b)).toHaveLength(2);
  });

  it("emits MEET for all 3 pairs when 3 farmers share a region", () => {
    const a = makeFarmer(world, "village", "A");
    const b = makeFarmer(world, "village", "B");
    const c = makeFarmer(world, "village", "C");
    sys.run({ tick: 0 });

    expect(meetMessages(a)).toHaveLength(2);
    expect(meetMessages(b)).toHaveLength(2);
    expect(meetMessages(c)).toHaveLength(2);

    const aPeers = new Set(meetMessages(a).map((m) => m.peerId));
    expect(aPeers).toEqual(new Set([b.id, c.id]));
    const bPeers = new Set(meetMessages(b).map((m) => m.peerId));
    expect(bPeers).toEqual(new Set([a.id, c.id]));
    const cPeers = new Set(meetMessages(c).map((m) => m.peerId));
    expect(cPeers).toEqual(new Set([a.id, b.id]));
  });

  it("does not pair across regions", () => {
    const a = makeFarmer(world, "village", "A");
    const b = makeFarmer(world, "farm-cora", "B");
    sys.run({ tick: 0 });
    expect(meetMessages(a)).toHaveLength(0);
    expect(meetMessages(b)).toHaveLength(0);
  });
});
