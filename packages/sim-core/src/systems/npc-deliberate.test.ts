import { describe, it, expect } from "vitest";
import { World } from "@engine/core";
import { bootstrapSim } from "../sim-bootstrap";
import type { GameEntity } from "../components";
import { NpcDeliberateSystem } from "./npc-deliberate";
import { getNpcBehavior, npcRoleOf } from "../agents/npc-behaviors";

const TICKS_PER_DAY = 20;

function run(seed: number, days: number) {
  const sim = bootstrapSim({ seed, ticksPerDay: TICKS_PER_DAY, maxDays: days + 5 });
  for (let tick = 0; tick < days * TICKS_PER_DAY; tick++) sim.scheduler.tick({ tick });
  return sim;
}

describe("npcRoleOf", () => {
  it("resolves each service tag to its role and unknown work NPCs to null", () => {
    const w = new World<GameEntity>();
    const smith = w.spawn({ blacksmith: { isBlacksmith: true } });
    const dock = w.spawn({ dockmaster: { isDockmaster: true } });
    const ambient = w.spawn({ transform: { x: 0, y: 0, prevX: 0, prevY: 0, rotation: 0 } });
    expect(npcRoleOf(smith)).toBe("blacksmith");
    expect(npcRoleOf(dock)).toBe("dockmaster");
    expect(npcRoleOf(ambient)).toBeNull();
  });

  it("registers a behavior for every patrolling role", () => {
    for (const role of ["tavern", "blacksmith", "carpenter", "dockmaster"]) {
      expect(getNpcBehavior(role), `behavior for ${role}`).toBeDefined();
    }
  });
});

describe("NpcDeliberateSystem (live sim)", () => {
  it("stamps a busyFactor on every service work-NPC", () => {
    const sim = run(0xc0ffee, 3);
    const npcs = [...sim.world.query("workNpc")].filter((e) => npcRoleOf(e) !== null);
    expect(npcs.length).toBeGreaterThan(0);
    for (const e of npcs) {
      expect(typeof e.workNpc.busyFactor).toBe("number");
      expect(e.workNpc.busyFactor!).toBeGreaterThanOrEqual(0.5); 
      expect(e.workNpc.busyFactor!).toBeLessThanOrEqual(1.6);
    }
  });

  it("the dockmaster busies up when the harbor board has contracts, idles when empty", () => {
    const sim = run(0xc0ffee, 1);
    const dock = [...sim.world.query("workNpc")].find((e) => npcRoleOf(e) === "dockmaster");
    const board = [...sim.world.query("harborBoard")][0]!;
    const sys = new NpcDeliberateSystem(sim.world);

    board.harborBoard.openContracts.length = 0;
    board.harborBoard.committed.clear();
    sys.run({ tick: 1 });
    expect(dock!.workNpc.busyFactor!).toBeGreaterThan(1); 

    board.harborBoard.openContracts.push({} as never);
    sys.run({ tick: 2 });
    expect(dock!.workNpc.busyFactor!).toBeLessThan(1); 
  });
});
