import { describe, it, expect } from "vitest";
import { World } from "@engine/core";
import type { GameEntity, WorkNpc } from "../components";
import { WorkNpcSystem } from "./work-npc";

function makeNpc(): { world: World<GameEntity>; e: GameEntity } {
  const world = new World<GameEntity>();
  const e = world.spawn({
    transform: { x: 0, y: 0, prevX: 0, prevY: 0, rotation: 0 },
    sprite: { atlasId: "main", frame: "structure/blacksmith", layer: 50, tintRgba: 0xffffffff },
    workNpc: {
      stations: [
        { tileX: 2, tileY: 0, facing: "side", flipX: false, pose: "npc/blacksmith/hammer" },
        { tileX: 2, tileY: 2, facing: "up", flipX: false, pose: null },
      ],
      stationIndex: 0,
      phase: "walking",
      timer: 1,
      poseFrame: null,
      facing: "down",
      flipX: false,
    } satisfies WorkNpc,
  });
  return { world, e };
}

function tick(world: World<GameEntity>, sys: WorkNpcSystem, n: number): void {
  for (let i = 0; i < n; i++) sys.run({ tick: i } as never);
}

describe("WorkNpcSystem", () => {
  it("walks one tile toward the station, then dwells and plays the pose", () => {
    const { world, e } = makeNpc();
    const sys = new WorkNpcSystem(world);

    // First step moves x toward 2 (x first, then y).
    tick(world, sys, 1);
    expect(e.transform!.x).toBe(1);
    expect(e.transform!.y).toBe(0);

    // A few more steps to arrive at (2,0) and flip to working.
    tick(world, sys, 12);
    expect(e.transform!.x).toBe(2);
    expect(e.transform!.y).toBe(0);
    expect(e.workNpc!.phase).toBe("working");
    expect(e.workNpc!.facing).toBe("side");
    expect(e.workNpc!.poseFrame).toMatch(/^npc\/blacksmith\/hammer-[ab]$/);
  });

  it("advances to the next station after dwelling", () => {
    const { world, e } = makeNpc();
    const sys = new WorkNpcSystem(world);
    // Walk to station 0 and dwell out the whole timer (90+ ticks), then it should
    // target station 1.
    tick(world, sys, 13 + 95);
    expect(e.workNpc!.stationIndex).toBe(1);
  });

  it("idle pose (pose:null) clears poseFrame at the station", () => {
    const { world, e } = makeNpc();
    e.workNpc!.stationIndex = 1; // station with pose:null
    e.workNpc!.phase = "walking";
    e.workNpc!.timer = 1;
    const sys = new WorkNpcSystem(world);
    tick(world, sys, 20); // walk to (2,2) and start working
    expect(e.transform!.x).toBe(2);
    expect(e.transform!.y).toBe(2);
    expect(e.workNpc!.phase).toBe("working");
    expect(e.workNpc!.poseFrame).toBeNull();
    expect(e.workNpc!.facing).toBe("up");
  });
});
