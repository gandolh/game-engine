/**
 * Villager job snapshot field (Citadel villager-job Chunk 1).
 *
 * VillagerSnapshot.job is a READ-ONLY projection: it is derived at snapshot
 * time from the TYPE of the workplace building a villager is assigned to (its
 * workX/workY centre tile), with "idle" for an unassigned villager. These tests
 * drive bootstrapSim() directly and assert the job matches the workplace type.
 */
import { describe, it, expect } from "vitest";
import { bootstrapSim } from "../sim-bootstrap";
import { jobForBuildingType } from "../entities/building";
import type { CitadelCommand } from "../snapshot/index";

const SEED = 0xc17ade1;
const TICKS_PER_DAY = 20;
const MAX_DAYS = 100;

function roadRow(y: number, x0: number, x1: number): CitadelCommand {
  const tiles: Array<{ x: number; y: number }> = [];
  for (let x = x0; x <= x1; x++) tiles.push({ x, y });
  return { type: "placeRoad", payload: { tiles } };
}

describe("villager job snapshot field", () => {
  function bootEconomy() {
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: MAX_DAYS });
    const cmds: CitadelCommand[] = [
      { type: "placeBuilding", payload: { buildingType: "storehouse", x: 10, y: 10 } },
      { type: "placeBuilding", payload: { buildingType: "house", x: 10, y: 6 } },
      { type: "placeBuilding", payload: { buildingType: "house", x: 14, y: 6 } },
      roadRow(10, 13, 17),
      { type: "placeRoad", payload: { tiles: [{ x: 11, y: 8 }, { x: 11, y: 9 }] } },
      { type: "placeRoad", payload: { tiles: [{ x: 15, y: 7 }, { x: 15, y: 8 }, { x: 15, y: 9 }, { x: 15, y: 10 }] } },
      { type: "placeBuilding", payload: { buildingType: "farm", x: 18, y: 10 } },
    ];
    for (const c of cmds) sim.commands.enqueue(c);
    return sim;
  }

  it("every villager snapshot carries a job string from the documented set", () => {
    const sim = bootEconomy();
    const allowed = new Set([
      "farmer", "miller", "baker", "woodcutter", "quarryman", "miner",
      "sawyer", "smith", "priest", "trader", "watchman", "soldier",
      "healer", "idle",
    ]);
    for (let tick = 0; tick < TICKS_PER_DAY * 30; tick++) {
      sim.scheduler.tick({ tick });
      const snap = sim.getSnapshot(tick);
      for (const v of snap.villagers) {
        expect(typeof v.job).toBe("string");
        expect(allowed.has(v.job)).toBe(true);
      }
    }
  });

  it("a villager assigned to a farm has job 'farmer'", () => {
    const sim = bootEconomy();
    let sawFarmer = false;
    for (let tick = 0; tick < TICKS_PER_DAY * 30; tick++) {
      sim.scheduler.tick({ tick });
      const snap = sim.getSnapshot(tick);
      // The only worker-slot building in the scenario is the farm, so any
      // non-idle villager must be a farmer.
      for (const v of snap.villagers) {
        if (v.fsm !== "idle") {
          expect(v.job).toBe("farmer");
          sawFarmer = true;
        }
      }
    }
    expect(sawFarmer).toBe(true);
  });

  it("an unassigned (idle) villager always has job 'idle'", () => {
    // The farm has only 2 worker slots; once filled, extra immigrants stay idle.
    // Whenever a villager's FSM is "idle" (unassigned), its job must be "idle".
    const sim = bootEconomy();
    let sawIdle = false;
    for (let tick = 0; tick < TICKS_PER_DAY * 30; tick++) {
      sim.scheduler.tick({ tick });
      const snap = sim.getSnapshot(tick);
      for (const v of snap.villagers) {
        if (v.fsm === "idle") {
          expect(v.job).toBe("idle");
          sawIdle = true;
        }
      }
    }
    expect(sawIdle).toBe(true);
  });

  it("a villager assigned to a bakery has job 'baker'", () => {
    // Drive a full bread chain so a villager staffs the bakery.
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: MAX_DAYS });
    const cmds: CitadelCommand[] = [
      { type: "placeBuilding", payload: { buildingType: "storehouse", x: 10, y: 10 } },
      { type: "placeBuilding", payload: { buildingType: "house", x: 10, y: 6 } },
      { type: "placeBuilding", payload: { buildingType: "house", x: 14, y: 6 } },
      { type: "placeBuilding", payload: { buildingType: "house", x: 18, y: 6 } },
      { type: "placeBuilding", payload: { buildingType: "bakery", x: 18, y: 10 } },
      roadRow(10, 11, 20),
      { type: "placeRoad", payload: { tiles: [{ x: 11, y: 8 }, { x: 11, y: 9 }] } },
      { type: "placeRoad", payload: { tiles: [{ x: 15, y: 7 }, { x: 15, y: 8 }, { x: 15, y: 9 }] } },
      { type: "placeRoad", payload: { tiles: [{ x: 19, y: 7 }, { x: 19, y: 8 }, { x: 19, y: 9 }] } },
    ];
    for (const c of cmds) sim.commands.enqueue(c);
    let sawBaker = false;
    for (let tick = 0; tick < TICKS_PER_DAY * 60; tick++) {
      sim.scheduler.tick({ tick });
      const snap = sim.getSnapshot(tick);
      for (const v of snap.villagers) {
        if (v.job === "baker") sawBaker = true;
      }
    }
    expect(sawBaker).toBe(true);
  });

  it("jobForBuildingType maps known workplaces and defaults unknown to idle", () => {
    expect(jobForBuildingType("farm")).toBe("farmer");
    expect(jobForBuildingType("mill")).toBe("miller");
    expect(jobForBuildingType("bakery")).toBe("baker");
    expect(jobForBuildingType("woodcutter")).toBe("woodcutter");
    expect(jobForBuildingType("quarry")).toBe("quarryman");
    expect(jobForBuildingType("mine")).toBe("miner");
    expect(jobForBuildingType("sawmill")).toBe("sawyer");
    expect(jobForBuildingType("smith")).toBe("smith");
    // Non-workplace / unmapped types fall back to the documented default.
    expect(jobForBuildingType("road")).toBe("idle");
    expect(jobForBuildingType("house")).toBe("idle");
    expect(jobForBuildingType("not-a-building")).toBe("idle");
  });
});
