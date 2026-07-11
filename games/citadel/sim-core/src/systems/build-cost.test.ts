/**
 * Citadel build-cost economy (cozy pivot). Drives bootstrapSim() directly (no Worker).
 *
 * Verifies the opt-in `chargeBuildCost` flag + `startingStock` grant:
 *  - OFF by default → placement is free (the determinism baseline + bulk-place demos
 *    are unchanged);
 *  - ON → placing a building DEBITS its `BUILD_COST` from the owner's stockpile;
 *  - an unaffordable placement is REJECTED ("cost") — the building is not spawned and
 *    nothing is charged;
 *  - the founding `startingStock` is granted;
 *  - a cost-charged run is deterministic (twice-run deep-equal).
 */
import { describe, it, expect } from "vitest";
import { bootstrapSim, loadFromSave } from "../sim-bootstrap";
import { localPlayer } from "../sim-state";
import { BUILD_COST, buildCost } from "../entities/building";
import { TerrainType } from "../world/terrain";
import type { TerrainGrid } from "../world/terrain";

const TPD = 20;

function findGrass(t: TerrainGrid, w: number, h: number, sx: number, sy: number): { x: number; y: number } {
  for (let r = 0; r < 60; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = sx + dx, y = sy + dy;
        if (x < 0 || y < 0 || x + w > t.width || y + h > t.height) continue;
        let ok = true;
        for (let yy = 0; yy < h && ok; yy++)
          for (let xx = 0; xx < w; xx++)
            if (t.cells[(y + yy) * t.width + (x + xx)] !== TerrainType.Grass) { ok = false; break; }
        if (ok) return { x, y };
      }
    }
  }
  throw new Error("no grass footprint found");
}

function placeHouse(sim: ReturnType<typeof bootstrapSim>, tick: number): { x: number; y: number } {
  const s = findGrass(sim.terrain, 2, 2, 20, 20);
  sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "house", x: s.x, y: s.y } });
  sim.scheduler.tick({ tick });
  return s;
}

const houseCount = (sim: ReturnType<typeof bootstrapSim>): number =>
  [...sim.world.query("building")].filter((e) => e.building.type === "house").length;

describe("build cost — opt-in flag", () => {
  it("is FREE by default: placing a house debits nothing and starts at 0 wood", () => {
    const sim = bootstrapSim({ seed: 1, ticksPerDay: TPD });
    const lp = localPlayer(sim.state);
    expect(lp.stockpiles.wood).toBe(0);
    placeHouse(sim, 0);
    expect(houseCount(sim)).toBe(1);
    expect(lp.stockpiles.wood).toBe(0); // free placement — no debit
  });

  it("when ON: a house placement DEBITS its BUILD_COST from the stockpile", () => {
    const sim = bootstrapSim({ seed: 1, ticksPerDay: TPD, chargeBuildCost: true, startingStock: { wood: 40 } });
    const lp = localPlayer(sim.state);
    expect(lp.stockpiles.wood).toBe(40); // founding grant
    placeHouse(sim, 0);
    expect(houseCount(sim)).toBe(1);
    expect(lp.stockpiles.wood).toBe(40 - (BUILD_COST["house"]?.wood ?? 0)); // 40 - 4 = 36
  });

  it("REJECTS an unaffordable placement (\"cost\") — not spawned, nothing charged", () => {
    // Grant less than a house costs (house = 4 wood).
    const sim = bootstrapSim({ seed: 1, ticksPerDay: TPD, chargeBuildCost: true, startingStock: { wood: 1 } });
    const lp = localPlayer(sim.state);
    placeHouse(sim, 0);
    expect(houseCount(sim)).toBe(0);     // not placed
    expect(lp.stockpiles.wood).toBe(1);  // not charged
  });

  it("charges stone for late buildings that cost it (smith = wood + stone)", () => {
    const sim = bootstrapSim({ seed: 1, ticksPerDay: TPD, chargeBuildCost: true, startingStock: { wood: 40, stone: 10 } });
    const lp = localPlayer(sim.state);
    lp.peakTier = "Village"; // smith is tier-locked to Village; unlock it so placement isn't a "tier" reject
    const s = findGrass(sim.terrain, 2, 2, 20, 20);
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "smith", x: s.x, y: s.y } });
    sim.scheduler.tick({ tick: 0 });
    const cost = buildCost("smith");
    expect(lp.stockpiles.wood).toBe(40 - (cost.wood ?? 0));
    expect(lp.stockpiles.stone).toBe(10 - (cost.stone ?? 0));
  });

  it("roads stay free even with costs ON (no BUILD_COST entry)", () => {
    expect(buildCost("road")).toEqual({});
  });

  it("a cost-charged run is deterministic (twice-run deep-equal snapshot)", () => {
    const run = (): unknown => {
      const sim = bootstrapSim({ seed: 9, ticksPerDay: TPD, chargeBuildCost: true, startingStock: { wood: 40 } });
      placeHouse(sim, 0);
      const s = findGrass(sim.terrain, 3, 3, 30, 30);
      sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "farm", x: s.x, y: s.y } });
      for (let t = 1; t < TPD * 3; t++) sim.scheduler.tick({ tick: t });
      return sim.getSnapshot(TPD * 3);
    };
    expect(run()).toEqual(run());
  });

  it("save/load round-trips with costs ON: the save persists the economy options", () => {
    const target = TPD * 2;
    const sim = bootstrapSim({ seed: 9, ticksPerDay: TPD, chargeBuildCost: true, startingStock: { wood: 40 } });
    placeHouse(sim, 0);
    for (let t = 1; t < target; t++) sim.scheduler.tick({ tick: t });
    const originalSnap = sim.getSnapshot(target);

    const save = sim.serializeSave(target);
    expect(save.chargeBuildCost).toBe(true);     // options persisted...
    expect(save.startingStock).toEqual({ wood: 40 });
    // ...so the replay charges the same costs + grants the same wood → identical stockpile.
    const loaded = loadFromSave(save);
    expect(loaded.getSnapshot(target).stockpiles).toEqual(originalSnap.stockpiles);
    expect(loaded.getSnapshot(target).stockpiles.wood).toBe(36); // 40 grant − 4 house
  });
});
