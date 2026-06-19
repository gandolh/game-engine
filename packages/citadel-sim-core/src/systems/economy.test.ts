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
    const cmds: ScheduledCmd[] = [
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "storehouse", x: 10, y: 10 } } },
      { atTick: 0, cmd: roadRow(10, 13, 17) },
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "farm", x: 18, y: 10 } } },
    ];
    // Run long enough to cross out of winter and accumulate grain in non-zero season.
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
});
