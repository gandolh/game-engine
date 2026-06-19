import { describe, it, expect, beforeEach } from "vitest";
import { World } from "@engine/core";
import type { GameEntity } from "../components";
import { MeetIndicatorSystem, INDICATOR_DURATION_TICKS } from "./meet-indicator";
import { ONT_ENCOUNTER } from "../protocols/encounter";
import { PERFORMATIVE } from "../protocols/performatives";
import type { RegionId } from "../world/regions";

function makeFarmer(world: World<GameEntity>, region: RegionId = "village"): GameEntity {
  return world.spawn({
    farmer: { name: "F", currentRegion: region },
    inbox: { messages: [] },
  });
}

function pushMeet(
  entity: GameEntity,
  peerId: number,
  tick: number,
  region: RegionId = "village",
): void {
  entity.inbox!.messages.push({
    performative: PERFORMATIVE.INFORM,
    ontology: ONT_ENCOUNTER.MEET,
    sender: "world",
    body: { peerId, regionId: region } as unknown as Record<string, unknown>,
    tickIssued: tick,
  });
}

describe("MeetIndicatorSystem", () => {
  let world: World<GameEntity>;
  let sys: MeetIndicatorSystem;

  beforeEach(() => {
    world = new World<GameEntity>();
    sys = new MeetIndicatorSystem(world);
  });

  it("tracks an indicator when a MEET message is present in an inbox", () => {
    const a = makeFarmer(world);
    const b = makeFarmer(world);

    pushMeet(a, b.id!, 0);
    sys.run({ tick: 0 });

    const active = sys.active(0);
    expect(active).toHaveLength(1);
    expect(active[0]!.farmerId).toBe(a.id);
    expect(active[0]!.peerId).toBe(b.id);
  });

  it("tracks separate indicators for both sides of a meet", () => {
    const a = makeFarmer(world);
    const b = makeFarmer(world);

    pushMeet(a, b.id!, 0);
    pushMeet(b, a.id!, 0);
    sys.run({ tick: 0 });

    const active = sys.active(0);
    expect(active).toHaveLength(2);
    const farmerIds = new Set(active.map((e) => e.farmerId));
    expect(farmerIds).toEqual(new Set([a.id, b.id]));
  });

  it("expires an indicator after INDICATOR_DURATION_TICKS", () => {
    const a = makeFarmer(world);
    const b = makeFarmer(world);

    pushMeet(a, b.id!, 0);
    sys.run({ tick: 0 });
    expect(sys.active(0)).toHaveLength(1);

    sys.run({ tick: INDICATOR_DURATION_TICKS - 1 });
    expect(sys.active(INDICATOR_DURATION_TICKS - 1)).toHaveLength(1);

    sys.run({ tick: INDICATOR_DURATION_TICKS });
    expect(sys.active(INDICATOR_DURATION_TICKS)).toHaveLength(0);
  });

  it("does not track a MEET message issued on a different tick", () => {
    const a = makeFarmer(world);
    const b = makeFarmer(world);

    pushMeet(a, b.id!, 0); 
    sys.run({ tick: 5 });

    expect(sys.active(5)).toHaveLength(0);
  });

  it("refreshes indicator when a new MEET fires for the same pair", () => {
    const a = makeFarmer(world);
    const b = makeFarmer(world);

    pushMeet(a, b.id!, 0);
    sys.run({ tick: 0 });
    expect(sys.active(0)[0]!.expiresAtTick).toBe(INDICATOR_DURATION_TICKS);

    pushMeet(a, b.id!, 5); 
    sys.run({ tick: 5 });
    expect(sys.active(5)).toHaveLength(1);
    expect(sys.active(5)[0]!.expiresAtTick).toBe(5 + INDICATOR_DURATION_TICKS);
  });

  it("handles multiple simultaneous pairs independently", () => {
    const a = makeFarmer(world);
    const b = makeFarmer(world);
    const c = makeFarmer(world);

    pushMeet(a, b.id!, 0);
    pushMeet(b, a.id!, 0);
    pushMeet(a, c.id!, 0);
    pushMeet(c, a.id!, 0);
    sys.run({ tick: 0 });

    expect(sys.active(0)).toHaveLength(4); 
  });
});
