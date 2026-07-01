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
import type { BuildingRuntimeState } from "../entities/building";
import type { SimState } from "../sim-state";
import { NeedsHappinessSystem } from "./needs-happiness";
import type { CitadelCommand } from "../snapshot/index";

const SEED = 0xc17ade1;
const TICKS_PER_DAY = 20;
const MAX_DAYS = 100;

function roadRow(y: number, x0: number, x1: number): CitadelCommand {
  const tiles: Array<{ x: number; y: number }> = [];
  for (let x = x0; x <= x1; x++) tiles.push({ x, y });
  return { type: "placeRoad", payload: { tiles } };
}

/** Spawn a 2×2 building with a connected runtime state (mirrors needs-happiness.test.ts). */
function addTestBuilding(state: SimState, type: string, x: number, y: number, ownerId = 0): number {
  const entity = state.buildingWorld.spawn({ building: { type, x, y, w: 2, h: 2, ownerId } });
  const rs: BuildingRuntimeState = {
    outputBuffer: 0,
    workerCount: 0,
    connected: true,
    productionTick: 0,
    level: 1,
  };
  state.buildingState.set(entity.id!, rs);
  return entity.id!;
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

  it("every villager snapshot carries a mood in [0,100]", () => {
    // Phase E: mood is a READ-ONLY projection of the HOME house's per-house mood
    // (Phase A). Must always be present and clamped to the documented range.
    const sim = bootEconomy();
    for (let tick = 0; tick < TICKS_PER_DAY * 40; tick++) {
      sim.scheduler.tick({ tick });
      const snap = sim.getSnapshot(tick);
      for (const v of snap.villagers) {
        expect(typeof v.mood).toBe("number");
        expect(v.mood).toBeGreaterThanOrEqual(0);
        expect(v.mood).toBeLessThanOrEqual(100);
      }
    }
  });

  it("a villager surfaces its HOME house's per-house mood on the snapshot", () => {
    // Phase E: construct a house with a chapel+watchpost+market in range (a fully
    // covered home settles to mood 100), park a villager's home ON that house, run
    // the daily needs pass so the house mood moves off 40, then assert the villager
    // reports the home house's mood (NOT the neutral default). Direct construction
    // (mirrors needs-happiness.test.ts) keeps it deterministic + independent of the
    // organic economy.
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: 1, worldWidth: 96, worldHeight: 96 });
    const state = sim.state;
    sim.stockpiles.grain = 10; // goods access needs stockpiled grain + market in range
    const homeId = addTestBuilding(state, "house", 30, 30);      // centre (31,31)
    addTestBuilding(state, "chapel", 32, 30);                    // faith in range
    addTestBuilding(state, "watchpost", 30, 32);                 // safety in range
    addTestBuilding(state, "market", 32, 32);                    // goods in range
    // Park a villager whose HOME is this house's top-left tile and who is idle
    // (stationed at home, so its snapshot position == homeX/homeY).
    state.villagerWorld.spawn({
      villager: {
        id: 9001, ownerId: 0, homeX: 30, homeY: 30, workX: 30, workY: 30,
        storeX: 30, storeY: 30, fsm: "idle", pathX: [], pathY: [], pathStep: 0,
        carryGood: null, carryAmount: 0, ticksAtWork: 0,
      },
    });
    // Run the daily needs pass several days so the covered house reaches mood 100.
    for (let day = 1; day <= 12; day++) {
      new NeedsHappinessSystem(state, TICKS_PER_DAY).run({ tick: TICKS_PER_DAY * day });
    }
    const houseMood = state.buildingState.get(homeId)?.mood ?? 40;
    expect(houseMood).toBeGreaterThan(40); // sanity: mood actually moved off the seed
    const snap = sim.getSnapshot(0);
    const v = snap.villagers.find((vv) => vv.id === 9001);
    expect(v).toBeDefined();
    expect(v!.mood).toBe(houseMood);
  });

  it("a villager with no resolvable home reports the neutral default mood of 40", () => {
    // Phase E: a villager whose home tile maps to no building defaults to 40.
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: 1, worldWidth: 96, worldHeight: 96 });
    sim.state.villagerWorld.spawn({
      villager: {
        id: 9002, ownerId: 0, homeX: 5, homeY: 5, workX: 5, workY: 5,
        storeX: 5, storeY: 5, fsm: "idle", pathX: [], pathY: [], pathStep: 0,
        carryGood: null, carryAmount: 0, ticksAtWork: 0,
      },
    });
    const v = sim.getSnapshot(0).villagers.find((vv) => vv.id === 9002);
    expect(v).toBeDefined();
    expect(v!.mood).toBe(40);
  });

  it("allHomesCovered is false for an empty/uncovered town and true when every home is met", () => {
    // Phase F: pure read over the per-house lacks* flags. An empty town (no houses)
    // is never "content"; it flips true only once every owned house has all needs.
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: 1, worldWidth: 96, worldHeight: 96 });
    const state = sim.state;

    // Empty town → false (no houses is not "content").
    expect(sim.getSnapshot(0).allHomesCovered).toBe(false);

    // One bare house (no services) → uncovered, so false.
    addTestBuilding(state, "house", 20, 20);
    new NeedsHappinessSystem(state, TICKS_PER_DAY).run({ tick: TICKS_PER_DAY });
    expect(sim.getSnapshot(0).allHomesCovered).toBe(false);

    // Fully cover that house (faith+safety+goods) and settle → true.
    sim.stockpiles.grain = 10;
    addTestBuilding(state, "chapel", 22, 20);
    addTestBuilding(state, "watchpost", 20, 22);
    addTestBuilding(state, "market", 22, 22);
    for (let day = 1; day <= 12; day++) {
      new NeedsHappinessSystem(state, TICKS_PER_DAY).run({ tick: TICKS_PER_DAY * day });
    }
    const snap = sim.getSnapshot(0);
    const houses = snap.buildings.filter((b) => b.type === "house" && b.ownerId === snap.localPlayerId);
    // The predicate must exactly track the per-house lacks* it reads over.
    const everyHouseMet = houses.length > 0 && houses.every((h) => !h.lacksFaith && !h.lacksSafety && !h.lacksGoods);
    expect(everyHouseMet).toBe(true);
    expect(snap.allHomesCovered).toBe(true);
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
