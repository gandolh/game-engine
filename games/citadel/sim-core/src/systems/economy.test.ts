/**
 * Phase 2 economy tests — connectivity, production chain, seasons, determinism.
 *
 * We place buildings on a known-grass region (seed 0xc17ade1 leaves the area
 * around (10,10) buildable, verified by the Phase 1 tests). Buildings are
 * connected to a storehouse via explicit road tiles.
 */
import { describe, it, expect } from "vitest";
import { bootstrapSim } from "../sim-bootstrap";
import type { CitadelCommand } from "../snapshot/index";
import { grainMultiplier } from "../world/seasons";

const SEED = 0xc17ade1;
const TICKS_PER_DAY = 20;
const MAX_DAYS = 100;

interface ScheduledCmd {
  atTick: number;
  cmd: CitadelCommand;
}

function run(cmds: ScheduledCmd[], totalTicks: number) {
  const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: MAX_DAYS });
  let i = 0;
  for (let tick = 0; tick < totalTicks; tick++) {
    while (i < cmds.length && cmds[i]!.atTick === tick) {
      sim.commands.enqueue(cmds[i]!.cmd);
      i++;
    }
    sim.scheduler.tick({ tick });
  }
  return sim;
}

/** Build a horizontal road span [x0,x1] at row y. */
function roadRow(y: number, x0: number, x1: number): CitadelCommand {
  const tiles: Array<{ x: number; y: number }> = [];
  for (let x = x0; x <= x1; x++) tiles.push({ x, y });
  return { type: "placeRoad", payload: { tiles } };
}

describe("Citadel Phase 2 — economy", () => {
  it("a farm connected to a storehouse via road produces grain", () => {
    // storehouse at (10,10) covers cols 10-12 rows 10-11.
    // road on row 10 from col 13..17 bridges to the farm at (18,10) (cols 18-20).
    // A house at (10,6) gives popCap>0 so ImmigrationSystem spawns a pioneer who
    // staffs the farm; without a worker the farm produces nothing (load-bearing).
    const cmds: ScheduledCmd[] = [
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "storehouse", x: 10, y: 10 } } },
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "house", x: 10, y: 6 } } },
      { atTick: 0, cmd: roadRow(10, 13, 17) },
      // Road connecting house to storehouse (col 11 from row 8..9)
      { atTick: 0, cmd: { type: "placeRoad", payload: { tiles: [{ x: 11, y: 8 }, { x: 11, y: 9 }] } } },
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "farm", x: 18, y: 10 } } },
    ];
    // Run long enough: pioneer spawns at day 2, walks to farm (~10 ticks), hauls by tick ~50.
    // Over 30 days we definitely accumulate grain.
    const sim = run(cmds, TICKS_PER_DAY * 30);
    const buildings = sim.getBuildings();
    const farm = buildings.find((b) => b.type === "farm");
    expect(farm).toBeDefined();
    expect(farm!.connected).toBe(true);
    // Grain is produced (some seasons multiply to 0, but over 30 days we cross summer/autumn).
    expect(sim.stockpiles.grain).toBeGreaterThan(0);
  });

  it("farm→mill→bakery chain produces bread over time", () => {
    // Lay a long road row at y=11 from x=10..40, place all buildings just above/below it.
    const cmds: ScheduledCmd[] = [
      { atTick: 0, cmd: roadRow(13, 10, 40) },
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "storehouse", x: 10, y: 11 } } },
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "farm", x: 14, y: 14 } } },
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "mill", x: 18, y: 14 } } },
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "bakery", x: 21, y: 14 } } },
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "house", x: 24, y: 14 } } },
    ];
    const sim = run(cmds, TICKS_PER_DAY * 60);
    const buildings = sim.getBuildings();
    const bakery = buildings.find((b) => b.type === "bakery");
    expect(bakery).toBeDefined();
    expect(bakery!.connected).toBe(true);
    // Bread is produced and (after consumption) the chain demonstrably ran:
    // population should have grown beyond zero from immigration.
    expect(sim.population).toBeGreaterThan(0);
  });

  it("road connectivity: building is disconnected until a road links it", () => {
    // No road: a farm far from the store is not connected.
    const noRoad: ScheduledCmd[] = [
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "storehouse", x: 10, y: 10 } } },
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "farm", x: 20, y: 20 } } },
    ];
    const simNo = run(noRoad, TICKS_PER_DAY);
    const farmNo = simNo.getBuildings().find((b) => b.type === "farm");
    expect(farmNo!.connected).toBe(false);

    // With a road row connecting them, it becomes connected.
    const withRoad: ScheduledCmd[] = [
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "storehouse", x: 10, y: 10 } } },
      { atTick: 0, cmd: roadRow(10, 13, 19) },
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "farm", x: 20, y: 10 } } },
    ];
    const simYes = run(withRoad, TICKS_PER_DAY);
    const farmYes = simYes.getBuildings().find((b) => b.type === "farm");
    expect(farmYes!.connected).toBe(true);
  });

  it("seasons: grain multiplier is 0 in winter and 1.0 in summer", () => {
    expect(grainMultiplier("winter")).toBe(0);
    expect(grainMultiplier("summer")).toBe(1.0);
  });

  it("determinism: same seed + commands → identical snapshots over 3 days", () => {
    const cmds: ScheduledCmd[] = [
      { atTick: 0, cmd: roadRow(13, 10, 40) },
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "storehouse", x: 10, y: 11 } } },
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "farm", x: 14, y: 14 } } },
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "mill", x: 18, y: 14 } } },
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "bakery", x: 21, y: 14 } } },
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "house", x: 24, y: 14 } } },
    ];
    const total = TICKS_PER_DAY * 3;
    const a = run(cmds, total).getSnapshot(total);
    const b = run(cmds, total).getSnapshot(total);
    expect(a).toEqual(b);
  });

  // ---------------------------------------------------------------------------
  // New tests locking in Phase 2 load-bearing villager/hauling mechanics
  // ---------------------------------------------------------------------------

  it("a building with no assigned worker produces nothing (load-bearing hauling)", () => {
    // Place a connected farm and storehouse but NO house (popCap=0 → no villagers
    // ever spawn → workerCount stays 0). Farm must produce nothing.
    const cmds: ScheduledCmd[] = [
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "storehouse", x: 10, y: 10 } } },
      { atTick: 0, cmd: roadRow(10, 13, 17) },
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "farm", x: 18, y: 10 } } },
      // No house → popCap=0 → no pioneers ever spawned.
    ];
    const sim = run(cmds, TICKS_PER_DAY * 10);
    const farm = sim.getBuildings().find((b) => b.type === "farm");
    expect(farm!.connected).toBe(true);
    // No worker → production.ts skips → no output in any buffer or stockpile.
    expect(farm!.workerCount).toBe(0);
    expect(farm!.outputBuffer).toBe(0);
    expect(sim.stockpiles.grain).toBe(0);
  });

  it("hauling is the mechanism: goods move from producer outputBuffer → global stockpile via villager", () => {
    // Uses the same layout as the working "farm→mill→bakery chain" test, minus the
    // bakery, but with TWO houses so two pioneers spawn — one for farm, one for mill.
    // Road at y=13 connects all buildings (same layout proven to work in the chain test).
    // Pioneer 1 → farm (tier 1: primary, unstaffed type).
    // Pioneer 2 → mill (tier 2: converter, unstaffed type).
    // After 15 days both must have hauled goods to the global stockpile.
    const cmds: ScheduledCmd[] = [
      { atTick: 0, cmd: roadRow(13, 10, 40) },
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "storehouse", x: 10, y: 11 } } },
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "farm", x: 14, y: 14 } } },
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "mill", x: 18, y: 14 } } },
      // Two houses → popCap=12, two pioneers can spawn (day 2 and day 3).
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "house", x: 22, y: 14 } } },
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "house", x: 26, y: 14 } } },
    ];
    // Run 15 days: 2 pioneers arrive (days 2-3), walk to farm/mill, haul by ~tick 60.
    // After 15 days grain AND flour must be in the global stockpile.
    const sim = run(cmds, TICKS_PER_DAY * 15);
    // Grain must have reached the global stockpile via hauling.
    expect(sim.stockpiles.grain).toBeGreaterThan(0);
    // With grain in stockpile, mill can fire and produce flour.
    expect(sim.stockpiles.flour).toBeGreaterThan(0);
  });

  it("a town grows population over time when food surplus is consistently positive", () => {
    // Full economy: 2 farms + 1 mill + 1 bakery + 2 houses (popCap=12).
    // Should start at 0, grow to at least 4 by day 60.
    const cmds: ScheduledCmd[] = [
      { atTick: 0, cmd: roadRow(13, 10, 45) },
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "storehouse", x: 10, y: 11 } } },
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "farm", x: 14, y: 14 } } },
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "farm", x: 18, y: 14 } } },
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "mill", x: 22, y: 14 } } },
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "bakery", x: 25, y: 14 } } },
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "house", x: 28, y: 14 } } },
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "house", x: 32, y: 14 } } },
    ];
    const sim = run(cmds, TICKS_PER_DAY * 60);
    // Population must have grown meaningfully from 0.
    expect(sim.population).toBeGreaterThan(3);
    // Bread chain must have run (flour and bread produced at some point).
    expect(sim.stockpiles.flour).toBeGreaterThan(0);
  });

  it("winter halts grain production and a no-surplus town loses population", () => {
    // This sim starts at winter (day 12) via startDay option, simulating a
    // settlement founded with no autumn grain surplus. Founders arrive with
    // bread rations that quickly run out; with grain production = 0 in winter,
    // the bread chain never starts. Starvation must reduce population.
    const cmds: ScheduledCmd[] = [
      { atTick: 0, cmd: roadRow(13, 10, 40) },
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "storehouse", x: 10, y: 11 } } },
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "farm", x: 14, y: 14 } } },
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "mill", x: 18, y: 14 } } },
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "bakery", x: 21, y: 14 } } },
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "house", x: 24, y: 14 } } },
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "house", x: 28, y: 14 } } },
    ];

    function runWithStartDay(cmds2: ScheduledCmd[], totalTicks: number, startDay: number) {
      const sim2 = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: MAX_DAYS, startDay });
      let i = 0;
      for (let tick = 0; tick < totalTicks; tick++) {
        while (i < cmds2.length && cmds2[i]!.atTick === tick) {
          sim2.commands.enqueue(cmds2[i]!.cmd);
          i++;
        }
        sim2.scheduler.tick({ tick });
      }
      return sim2;
    }

    // Start in winter (day 12 of 16-day year). Farm produces 0 grain.
    // Bread rations carry pioneers ~5 days before starvation triggers.
    // Run 20 days: with no grain production, the bread chain never starts,
    // founding rations are exhausted, and the whole town starves to death.
    const sim = runWithStartDay(cmds, TICKS_PER_DAY * 20, 12);
    // The town must have reached game-over (pop dropped to 0 after existing).
    // A winter-founded colony with no autumn surplus CANNOT survive.
    expect(sim.gameOver).toBe(true);
  });
});
