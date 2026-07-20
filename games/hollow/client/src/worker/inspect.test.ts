import { describe, it, expect } from "vitest";
import { bootstrapHollowSim } from "@hollow/sim-core/sim-bootstrap";
import { agentName } from "../agent-name";
import { buildInspectDetail } from "./inspect";

describe("buildInspectDetail", () => {
  it("returns a full detail for a live agent, without mutating the sim", () => {
    const sim = bootstrapHollowSim({ seed: 1, ticksPerDay: 20, population: 5 });
    for (let i = 0; i < 5; i++) sim.tick();

    const before = sim.getSnapshot();
    const agentId = before.agents[0]!.id;

    const detail = buildInspectDetail(sim, 5, agentId);
    expect(detail).not.toBeNull();
    expect(detail!.id).toBe(agentId);
    expect(detail!.name).toBe(agentName(agentId));
    expect(detail!.alive).toBe(true);
    expect(detail!.stage).toBe("adult");
    expect(detail!.needs).not.toBeNull();
    expect(Object.keys(detail!.needs!).length).toBeGreaterThan(0);
    expect(detail!.bdi).not.toBeNull();
    expect(Array.isArray(detail!.relationships)).toBe(true);
    expect(detail!.genome.appearance.skinTone.length).toBeGreaterThan(0);

    // A read-only inspect must not perturb the sim: a second identical tick
    // sequence from a fresh identically-seeded sim matches this one exactly.
    const replay = bootstrapHollowSim({ seed: 1, ticksPerDay: 20, population: 5 });
    for (let i = 0; i < 5; i++) replay.tick();
    expect(replay.getSnapshot()).toEqual(sim.getSnapshot());
  });

  it("returns null for an id that was never spawned", () => {
    const sim = bootstrapHollowSim({ seed: 2, ticksPerDay: 20, population: 3 });
    sim.tick();
    expect(buildInspectDetail(sim, 1, 999_999)).toBeNull();
  });

  it("returns a reduced detail for a dead/despawned agent, from the lineage record", () => {
    const sim = bootstrapHollowSim({ seed: 3, ticksPerDay: 20, population: 4 });
    sim.tick();

    const victimId = sim.getSnapshot().agents[0]!.id;
    // Simulate death the way HollowLifecycleSystem does (despawn + lineage
    // markDeath) without running a full starvation/old-age scenario — this
    // test is exercising buildInspectDetail's DEAD branch, not the
    // lifecycle system itself (which has its own tests in sim-core).
    for (const entity of sim.world.query("agent")) {
      if (entity.id === victimId) {
        sim.world.despawn(entity);
        break;
      }
    }
    sim.lineage.markDeath(victimId, 42, "oldAge");

    const detail = buildInspectDetail(sim, 100, victimId);
    expect(detail).not.toBeNull();
    expect(detail!.alive).toBe(false);
    expect(detail!.stage).toBe("deceased");
    expect(detail!.needs).toBeNull();
    expect(detail!.bdi).toBeNull();
    expect(detail!.relationships).toEqual([]);
    expect(detail!.deathCause).toBe("oldAge");
    expect(detail!.deathTick).toBe(42);
    expect(detail!.ageTicks).toBe(42 - 0);
    expect(detail!.genome.appearance.skinTone.length).toBeGreaterThan(0);
  });
});
