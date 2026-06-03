import { describe, it, expect, beforeEach } from "vitest";
import { World } from "@engine/core";
import type { GameEntity } from "../components";
import { PerceiveSystem } from "./perceive";
import { ONT_SIMULATION, type PhaseStartBody } from "../protocols";
import type { RegionId } from "../world/regions";

function spawnFarmer(
  world: World<GameEntity>,
  over: { region?: RegionId; home?: RegionId; apMax?: number; apCurrent?: number } = {},
): GameEntity {
  const apMax = over.apMax ?? 8;
  return world.spawn({
    fsm: { current: "WAIT_DAY", enteredTick: 0 },
    beliefs: { data: { currentDay: 1 }, revision: 0 },
    inbox: { messages: [] },
    farmer: {
      name: "F",
      currentRegion: over.region ?? "farm-cora",
      homeRegion: over.home ?? "farm-cora",
    },
    ap: {
      current: over.apCurrent ?? 0,
      max: apMax,
      penaltyPending: false,
      penaltyCapacity: Math.floor(apMax / 2),
      away: false,
    },
  });
}

function pushPhase(f: GameEntity, phase: PhaseStartBody["phase"], day = 1): void {
  f.inbox!.messages.push({
    performative: "inform",
    ontology: ONT_SIMULATION.PHASE_START,
    sender: "world",
    body: { day, phase } as unknown as Record<string, unknown>,
    tickIssued: 0,
  });
}

describe("PerceiveSystem — intra-day phases (brief 27)", () => {
  let world: World<GameEntity>;
  let sys: PerceiveSystem;

  beforeEach(() => {
    world = new World<GameEntity>();
    sys = new PerceiveSystem(world);
  });

  it("morning PHASE_START refills AP to max (rested) and arms deliberation", () => {
    const f = spawnFarmer(world, { apMax: 8, apCurrent: 0 });
    pushPhase(f, "morning");
    sys.run({ tick: 0 });
    expect(f.ap!.current).toBe(8);
    expect(f.fsm!.current).toBe("PERCEIVE");
    expect(f.beliefs!.data.phase).toBe("morning");
  });

  it("morning refill is HALVED when the farmer was unrested", () => {
    const f = spawnFarmer(world, { apMax: 8, apCurrent: 0 });
    f.ap!.unrested = true;
    pushPhase(f, "morning");
    sys.run({ tick: 0 });
    expect(f.ap!.current).toBe(4); // floor(8/2)
    expect(f.ap!.unrested).toBe(false); // cleared on wake
  });

  it("work PHASE_START re-arms deliberation WITHOUT refilling AP (daily budget)", () => {
    const f = spawnFarmer(world, { apMax: 8, apCurrent: 3 });
    pushPhase(f, "work");
    sys.run({ tick: 240 });
    expect(f.ap!.current).toBe(3); // unchanged — carries across phases
    expect(f.fsm!.current).toBe("PERCEIVE");
  });

  it("night PHASE_START at home → SLEEP, rested (not unrested)", () => {
    const f = spawnFarmer(world, { region: "farm-cora", home: "farm-cora" });
    pushPhase(f, "night");
    sys.run({ tick: 1080 });
    expect(f.fsm!.current).toBe("SLEEP");
    expect(f.ap!.unrested).toBe(false);
  });

  it("night PHASE_START away from home → SLEEP, flagged unrested", () => {
    const f = spawnFarmer(world, { region: "village", home: "farm-cora" });
    pushPhase(f, "night");
    sys.run({ tick: 1080 });
    expect(f.fsm!.current).toBe("SLEEP");
    expect(f.ap!.unrested).toBe(true);
  });

  it("does not interrupt a farmer mid-cycle (only re-arms from WAIT_DAY/SLEEP)", () => {
    const f = spawnFarmer(world);
    f.fsm!.current = "ACT"; // mid deliberation/act
    pushPhase(f, "work");
    sys.run({ tick: 240 });
    expect(f.fsm!.current).toBe("ACT"); // untouched
  });
});
