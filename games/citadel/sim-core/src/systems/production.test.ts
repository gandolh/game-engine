/**
 * Cozy-pivot Phase B, Chunk 2 — happiness → productivity floor.
 *
 * Two layers:
 *   1. `productivityFactor` is a pure ramp: floor at h=0, 1.0 at h=100, monotonic,
 *      never below the floor.
 *   2. ProductionSystem scales a building's per-cycle output by the LOCAL
 *      happiness signal (the assigned worker's home-house mood), falling back to
 *      the per-player happiness when no worker/home resolves — and never to 0.
 *
 * The integration tests drive ProductionSystem directly with hand-set runtime
 * state (the same pattern as the stockpile-pressure test in economy.test.ts), so
 * nothing else mutates the buffer and the happiness factor is isolated.
 */
import { describe, it, expect } from "vitest";
import { bootstrapSim } from "../sim-bootstrap";
import { ProductionSystem, productivityFactor } from "./production";
import { getProductionDef, effectiveOutputPerCycle } from "../entities/building";
import type { SimState } from "../sim-state";
import type { VillagerComponent } from "../entities/villager";

const SEED = 0xc17ade1;
const TICKS_PER_DAY = 20;
const MAX_DAYS = 100;

/** A fully-formed villager component with sensible inert defaults. */
function makeVillager(over: Partial<VillagerComponent>): VillagerComponent {
  return {
    id: 0,
    ownerId: 0,
    homeX: 0,
    homeY: 0,
    workX: 0,
    workY: 0,
    storeX: 0,
    storeY: 0,
    fsm: "work",
    pathX: [],
    pathY: [],
    pathStep: 0,
    carryGood: null,
    carryAmount: 0,
    ticksAtWork: 0,
    ...over,
  };
}

/**
 * Spawn a connected, worker-staffed WOODCUTTER at a fixed centre and return its
 * id. Woodcutter is deliberate: output 2/cycle and NO seasonal multiplier, so the
 * happiness factor is the only modifier on the base output (a farm would have the
 * grain-season multiplier muddy the assertions). ProductionSystem does not check
 * terrain, so spawning one directly is fine.
 */
function spawnWoodcutter(state: SimState, x: number, y: number): number {
  const e = state.buildingWorld.spawn({
    building: { type: "woodcutter", x, y, w: 2, h: 2, ownerId: 0 },
  });
  state.buildingState.set(e.id!, {
    outputBuffer: 0,
    workerCount: 1,
    connected: true,
    productionTick: -1000, // a full cycle already elapsed → fires immediately
    level: 1,
  });
  return e.id!;
}

/** Run a single fired production cycle and return the building's accumulated output. */
function outputAfterOneCycle(state: SimState, buildingId: number): number {
  const prod = new ProductionSystem(state);
  prod.run({ tick: 0 });
  return state.buildingState.get(buildingId)!.outputBuffer;
}

describe("productivityFactor — pure happiness ramp", () => {
  it("floors at 0.6 (h=0) and tops at 1.0 (h=100)", () => {
    expect(productivityFactor(0)).toBeCloseTo(0.6, 10);
    expect(productivityFactor(100)).toBeCloseTo(1.0, 10);
  });

  it("is linear: h=50 → 0.8", () => {
    expect(productivityFactor(50)).toBeCloseTo(0.8, 10);
  });

  it("is monotonic non-decreasing across 0..100", () => {
    let prev = -Infinity;
    for (let h = 0; h <= 100; h++) {
      const f = productivityFactor(h);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
  });

  it("never drops below the 0.6 floor, even for out-of-range input", () => {
    expect(productivityFactor(-50)).toBeGreaterThanOrEqual(0.6);
    expect(productivityFactor(0)).toBeGreaterThanOrEqual(0.6);
    expect(productivityFactor(200)).toBeLessThanOrEqual(1.0);
    expect(productivityFactor(200)).toBeGreaterThanOrEqual(0.6);
  });
});

describe("ProductionSystem — happiness scales output to a floor (never 0)", () => {
  it("a low-happiness town produces LESS than a high-happiness one, but STILL > 0", () => {
    const def = getProductionDef("woodcutter")!;
    const base = effectiveOutputPerCycle(def, 1); // 2 wood/cycle at L1

    // High happiness via per-player fallback (no villagers → no local signal).
    const hi = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: MAX_DAYS }).state;
    hi.players[0]!.happiness = 100;
    const hiB = spawnWoodcutter(hi, 14, 14);
    const hiOut = outputAfterOneCycle(hi, hiB);

    // Low happiness via the same fallback path.
    const lo = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: MAX_DAYS }).state;
    lo.players[0]!.happiness = 0;
    const loB = spawnWoodcutter(lo, 14, 14);
    const loOut = outputAfterOneCycle(lo, loB);

    expect(hiOut).toBe(base);              // h=100 → factor 1.0 → full output
    expect(loOut).toBeLessThan(hiOut);     // unhappy town slows down
    expect(loOut).toBeGreaterThan(0);      // but the floor holds — never 0
    expect(loOut).toBe(Math.floor(base * 0.6)); // 2 × 0.6 = 1.2 → 1
  });
});

describe("ProductionSystem — autonomous town-hall work-hours output lift (cozy-pivot Phase G)", () => {
  /**
   * Spawn a connected, staffed BAKERY at L3 (effective output 6 flour→bread/cycle)
   * and return its id. L3 output 6 is chosen so the +20% town-hall lift crosses an
   * integer boundary (6 → floor(6×1.2)=7), making the placement bonus observable
   * (a base-2/3 producer floors the lift away — same as the old workHours decree).
   */
  function spawnBakeryL3(state: SimState, x: number, y: number): number {
    const e = state.buildingWorld.spawn({
      building: { type: "bakery", x, y, w: 2, h: 2, ownerId: 0 },
    });
    state.buildingState.set(e.id!, {
      outputBuffer: 0,
      workerCount: 1,
      connected: true,
      productionTick: -1000, // fire immediately
      level: 3,
    });
    return e.id!;
  }

  function placeTownHall(state: SimState, x: number, y: number): void {
    state.buildingWorld.spawn({
      building: { type: "town-hall", x, y, w: 3, h: 3, ownerId: 0 },
    });
  }

  it("a producer within a town hall's radius outputs MORE than one out of range", () => {
    // WITH a town hall adjacent (its 3×3 centre near the bakery, dist ≤ 10).
    const covered = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: MAX_DAYS }).state;
    covered.players[0]!.happiness = 100; // isolate the town-hall lift from the throttle
    covered.players[0]!.stockpiles.flour = 100; // keep the converter fed
    const cId = spawnBakeryL3(covered, 20, 20); // centre (21,21)
    placeTownHall(covered, 22, 20);             // centre (23,21) → dist 2 ≤ 10
    const cOut = outputAfterOneCycle(covered, cId);

    // WITHOUT any town hall.
    const bare = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: MAX_DAYS }).state;
    bare.players[0]!.happiness = 100;
    bare.players[0]!.stockpiles.flour = 100;
    const bId = spawnBakeryL3(bare, 20, 20);
    const bOut = outputAfterOneCycle(bare, bId);

    const def = getProductionDef("bakery")!;
    const base = effectiveOutputPerCycle(def, 3); // 6
    expect(bOut).toBe(base);                       // 6, no lift
    expect(cOut).toBe(Math.floor(base * 1.2));     // floor(6×1.2)=7, lifted
    expect(cOut).toBeGreaterThan(bOut);
  });

  it("a town hall out of range (dist > 10) does NOT lift output", () => {
    const state = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: MAX_DAYS }).state;
    state.players[0]!.happiness = 100;
    state.players[0]!.stockpiles.flour = 100;
    const id = spawnBakeryL3(state, 20, 20);   // centre (21,21)
    placeTownHall(state, 60, 60);              // far away → no coverage
    const out = outputAfterOneCycle(state, id);
    expect(out).toBe(effectiveOutputPerCycle(getProductionDef("bakery")!, 3)); // 6, unlifted
  });
});

describe("ProductionSystem — local (home-house mood) preferred over player happiness", () => {
  it("a high-mood worker home lifts output even when player happiness is low", () => {
    const def = getProductionDef("woodcutter")!;
    const base = effectiveOutputPerCycle(def, 1);

    const state = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: MAX_DAYS }).state;
    state.players[0]!.happiness = 0; // player-wide is miserable...

    const farmId = spawnWoodcutter(state, 14, 14);
    const farmCx = 14 + 1; // centre of a 2×2 at (14,14)
    const farmCy = 14 + 1;

    // A house with HIGH mood, and a villager living there who works the farm.
    const house = state.buildingWorld.spawn({
      building: { type: "house", x: 5, y: 5, w: 2, h: 2, ownerId: 0 },
    });
    const houseCx = 5 + 1;
    const houseCy = 5 + 1;
    state.buildingState.set(house.id!, {
      outputBuffer: 0,
      workerCount: 0,
      connected: true,
      productionTick: 0,
      level: 1,
      mood: 100, // ...but this worker's home is thriving
    });
    state.villagerWorld.spawn({
      villager: makeVillager({
        homeX: houseCx,
        homeY: houseCy,
        workX: farmCx,
        workY: farmCy,
      }),
    });

    const out = outputAfterOneCycle(state, farmId);
    // Local mood 100 wins over player happiness 0 → full output, not the floor.
    expect(out).toBe(base);
  });

  it("falls back to player happiness when no worker-home resolves", () => {
    const def = getProductionDef("woodcutter")!;
    const base = effectiveOutputPerCycle(def, 1);

    const state = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: MAX_DAYS }).state;
    state.players[0]!.happiness = 100; // high player-wide happiness
    // No villager assigned to this building → no local signal → fallback path.
    const farmId = spawnWoodcutter(state, 14, 14);

    const out = outputAfterOneCycle(state, farmId);
    expect(out).toBe(base); // fallback to player happiness 100 → full output
  });

  it("local low mood drags output below the player-happiness rate (and never to 0)", () => {
    const def = getProductionDef("woodcutter")!;
    const base = effectiveOutputPerCycle(def, 1);

    const state = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: MAX_DAYS }).state;
    state.players[0]!.happiness = 100; // player-wide is great...

    const farmId = spawnWoodcutter(state, 14, 14);
    const farmCx = 14 + 1;
    const farmCy = 14 + 1;

    const house = state.buildingWorld.spawn({
      building: { type: "house", x: 5, y: 5, w: 2, h: 2, ownerId: 0 },
    });
    state.buildingState.set(house.id!, {
      outputBuffer: 0,
      workerCount: 0,
      connected: true,
      productionTick: 0,
      level: 1,
      mood: 0, // ...but this worker's home is miserable
    });
    state.villagerWorld.spawn({
      villager: makeVillager({ homeX: 6, homeY: 6, workX: farmCx, workY: farmCy }),
    });

    const out = outputAfterOneCycle(state, farmId);
    expect(out).toBe(Math.floor(base * 0.6)); // local mood 0 → floor, not 1.0
    expect(out).toBeGreaterThan(0);
    expect(out).toBeLessThan(base);
  });
});
