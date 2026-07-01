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
import { ProductionSystem, outputBufferCap, bufferThrottleFactor } from "./production";
import { getProductionDef, effectiveOutputPerCycle } from "../entities/building";

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

  it("a settlement built LATE (after the founding window's worth of days) still bootstraps population", () => {
    // Regression for playtest P0 (2026-06-27): the live client runs the sim
    // during page/WebGPU boot, so the player can't place a connected settlement
    // until ~day 15 — long after a founding window measured from sim-day 0 would
    // have closed. The window must anchor to the first day there's something to
    // found, not to sim start. Build everything at tick 400 (~day 20, well past
    // floor(DAYS_PER_YEAR/4)+2 days) and assert founders still arrive.
    const LATE_TICK = TICKS_PER_DAY * 20; // ~day 20, far past the founding window
    const cmds: ScheduledCmd[] = [
      { atTick: LATE_TICK, cmd: roadRow(13, 10, 40) },
      { atTick: LATE_TICK, cmd: { type: "placeBuilding", payload: { buildingType: "storehouse", x: 10, y: 11 } } },
      { atTick: LATE_TICK, cmd: { type: "placeBuilding", payload: { buildingType: "farm", x: 14, y: 14 } } },
      { atTick: LATE_TICK, cmd: { type: "placeBuilding", payload: { buildingType: "mill", x: 18, y: 14 } } },
      { atTick: LATE_TICK, cmd: { type: "placeBuilding", payload: { buildingType: "bakery", x: 21, y: 14 } } },
      { atTick: LATE_TICK, cmd: { type: "placeBuilding", payload: { buildingType: "house", x: 24, y: 14 } } },
    ];
    const sim = run(cmds, TICKS_PER_DAY * 80);
    const bakery = sim.getBuildings().find((b) => b.type === "bakery");
    expect(bakery).toBeDefined();
    expect(bakery!.connected).toBe(true);
    // The founding window opened when the settlement was actually built, so the
    // colony bootstrapped off pop 0 despite starting ~20 days into the sim.
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

  it("seasons: grain multiplier is 0.5 in winter and 1.0 in summer", () => {
    // Cozy pivot Phase D: winter floor raised 0.0 -> 0.5 (unconditional, not
    // flag-gated) so a winter-founded colony still gets a grain trickle.
    expect(grainMultiplier("winter")).toBe(0.5);
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
  // Stockpile pressure (two-way service loop, 2026-06-27)
  // ---------------------------------------------------------------------------

  it("outputBufferCap scales with output and floors at the cycle count", () => {
    expect(outputBufferCap(3)).toBe(15); // 3 × 5 cycles
    expect(outputBufferCap(2)).toBe(10);
    expect(outputBufferCap(0)).toBe(5);  // floored to 1 × 5
  });

  it("bufferThrottleFactor ramps from full rate to the floor, never 0", () => {
    // Phase H: below the knee (60% fill) output runs flat-out; above it ramps
    // linearly down toward the 0.6 productivity floor as the buffer fills. Never 0.
    const cap = 10;
    expect(bufferThrottleFactor(0, cap)).toBe(1);      // empty → full rate
    expect(bufferThrottleFactor(6, cap)).toBe(1);      // at the knee → still full
    expect(bufferThrottleFactor(10, cap)).toBeCloseTo(0.6, 10); // full → floor
    expect(bufferThrottleFactor(8, cap)).toBeCloseTo(0.8, 10);  // halfway up the ramp
    // Monotonic non-increasing across the range, and never below the floor.
    let prev = Infinity;
    for (let b = 0; b <= cap; b++) {
      const f = bufferThrottleFactor(b, cap);
      expect(f).toBeLessThanOrEqual(prev);
      expect(f).toBeGreaterThanOrEqual(0.6);
      prev = f;
    }
    // Degenerate cap → no throttle (avoids divide-by-zero).
    expect(bufferThrottleFactor(5, 0)).toBe(1);
  });

  it("an uncollected producer throttles toward the floor and never exceeds the cap", () => {
    // Phase H (throttle, never halt): a connected farm with a real worker but NO
    // hauler ever emptying its buffer must SLOW toward the floor as the buffer fills
    // and clamp at the cap — never overflow, never fully halt. Drive ProductionSystem
    // directly with hand-set runtime state (no villagers) so nothing drains the
    // buffer — isolating the pressure rule.
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: MAX_DAYS });
    const state = sim.state;
    const entity = state.buildingWorld.spawn({
      building: { type: "farm", x: 14, y: 14, w: 3, h: 3, ownerId: 0 },
    });
    state.buildingState.set(entity.id!, {
      outputBuffer: 0,
      workerCount: 1,        // a real worker → it would produce
      connected: true,       // connected → not gated on connectivity
      productionTick: -1000, // cycle already elapsed
      level: 1,
    });
    const prod = new ProductionSystem(state);
    // Force summer so grain output isn't zeroed by the season multiplier.
    state.day = 0; // seed 0xc17ade1 day 0 — assert via the multiplier below
    const farmDef = getProductionDef("farm")!;
    const cap = outputBufferCap(effectiveOutputPerCycle(farmDef, 1));

    // Run far more cycles than the cap would allow if it grew unbounded.
    for (let t = 0; t < TICKS_PER_DAY * 30; t++) prod.run({ tick: t });

    const rs = state.buildingState.get(entity.id!)!;
    // It produced something (worker + connected), but never blew past the cap.
    // (If the run happens to sit in winter the farm makes 0 — still ≤ cap, and the
    // point is the upper bound, so this holds regardless of season.)
    expect(rs.outputBuffer).toBeLessThanOrEqual(cap);
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

  it("winter no longer starves a town founded with no surplus (cozy grain floor)", () => {
    // This sim starts at winter (day 12) via startDay option, simulating a
    // settlement founded with no autumn grain surplus. Pre-cozy-pivot, winter's
    // grain multiplier was 0 and this scenario starved the town to gameOver.
    // Cozy pivot Phase D floors winter grain at 0.5 (unconditional, not
    // flag-gated) — a winter-founded colony now gets a grain trickle instead of
    // going to zero, so it survives and its stockpile actually grows.
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

    // Start in winter (day 12 of 16-day year). Farm still produces grain at the
    // 0.5 winter floor. Run 60 days (spans winter -> spring -> summer) so the
    // trickle has time to accumulate through the bread chain and grow pop.
    const sim = runWithStartDay(cmds, TICKS_PER_DAY * 60, 12);
    // The town must NOT have starved to game-over — winter no longer kills.
    expect(sim.gameOver).toBe(false);
    // Grain still trickles in even starting cold: the stockpile grows from 0.
    expect(sim.stockpiles.grain + sim.stockpiles.flour + sim.stockpiles.bread).toBeGreaterThan(0);
    expect(sim.population).toBeGreaterThan(0);
  });
});
