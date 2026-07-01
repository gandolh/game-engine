/**
 * seedTown — the cozy cold-open pre-seeded "alive core".
 *
 * When `bootstrapSim({ seedTown: true })`, the building world opens with a
 * compact, road-connected bread chain (farm→mill→bakery) plus a house and a
 * storehouse near the map center — a living town, not an empty map — so the
 * founding deadlock is structurally impossible (a pioneer spawns unprompted).
 *
 * When absent/false (the default), bootstrap output is byte-identical to today:
 * ZERO buildings placed. The flag moves no baseline.
 */
import { describe, it, expect } from "vitest";
import { bootstrapSim, loadFromSave } from "../sim-bootstrap";
import type { CitadelSimResult } from "../sim-bootstrap";
import { getProductionDef } from "../entities/building";

const SEED = 12345;
const TICKS_PER_DAY = 1200;

function types(sim: CitadelSimResult): string[] {
  return sim.getBuildings().map((b) => b.type).sort();
}

describe("seedTown", () => {
  it("seeds the expected building types after bootstrap", () => {
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: 5, seedTown: true });
    const present = new Set(types(sim));
    for (const t of ["farm", "mill", "bakery", "house", "storehouse"]) {
      expect(present.has(t)).toBe(true);
    }
    // Road tiles are also laid (the connective spine).
    const roadTiles = Array.from(sim.roadGrid).filter((v) => v === 1).length;
    expect(roadTiles).toBeGreaterThan(0);
  });

  it("marks the whole core connected after one connectivity pass", () => {
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: 5, seedTown: true });
    sim.scheduler.tick({ tick: 0 });
    const buildings = sim.getBuildings();
    expect(buildings.length).toBeGreaterThan(0);
    for (const b of buildings) {
      expect(b.connected).toBe(true);
    }
  });

  it("forms a foundable, worker-slotted bread chain", () => {
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: 5, seedTown: true });
    for (const t of ["farm", "mill", "bakery"]) {
      const def = getProductionDef(t);
      expect(def).toBeDefined();
      expect(def!.workerSlots).toBeGreaterThan(0);
    }
  });

  it("spawns a villager within ~1–2 days with NO player commands (deadlock-proof)", () => {
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: 5, seedTown: true });
    // Run two in-game days. First day boundary establishes the immigration
    // baseline; the second processes it and the pioneer founds the town.
    for (let tick = 0; tick <= TICKS_PER_DAY * 2; tick++) {
      sim.scheduler.tick({ tick });
    }
    expect(sim.population).toBeGreaterThan(0);
  });

  it("default (seedTown false) bootstraps an EMPTY map — baseline unchanged", () => {
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: 5 });
    expect(sim.getBuildings().length).toBe(0);
    expect(Array.from(sim.roadGrid).filter((v) => v === 1).length).toBe(0);
    const explicitFalse = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: 5, seedTown: false });
    expect(explicitFalse.getBuildings().length).toBe(0);
  });

  it("does not charge the seed to the stockpile even with chargeBuildCost on", () => {
    // No startingStock grant → stockpile is all zeros; a charged seed would have
    // been rejected on "cost". A free seed still lands the full core.
    const sim = bootstrapSim({
      seed: SEED,
      ticksPerDay: TICKS_PER_DAY,
      maxDays: 5,
      seedTown: true,
      chargeBuildCost: true,
    });
    const present = new Set(types(sim));
    for (const t of ["farm", "mill", "bakery", "house", "storehouse"]) {
      expect(present.has(t)).toBe(true);
    }
    // Stockpile untouched (no debit).
    expect(sim.stockpiles.wood).toBe(0);
  });

  it("does NOT record the seed placements into the command log", () => {
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: 5, seedTown: true });
    const save = sim.serializeSave(0);
    expect(save.commandLog.length).toBe(0);
    expect(save.seedTown).toBe(true);
  });

  it("save/load round-trips a seeded town to identical building count + population", () => {
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: 5, seedTown: true });
    const RUN_TICKS = TICKS_PER_DAY * 2 + 37;
    for (let tick = 0; tick <= RUN_TICKS; tick++) {
      sim.scheduler.tick({ tick });
    }
    const buildingsBefore = sim.getBuildings().length;
    const popBefore = sim.population;
    expect(popBefore).toBeGreaterThan(0);

    const save = sim.serializeSave(RUN_TICKS);
    expect(save.seedTown).toBe(true);

    const reloaded = loadFromSave(save);
    expect(reloaded.getBuildings().length).toBe(buildingsBefore);
    expect(reloaded.population).toBe(popBefore);
  });
});
