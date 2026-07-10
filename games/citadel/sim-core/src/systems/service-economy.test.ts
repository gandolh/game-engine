/**
 * Brief 100 — the two-way service loop's UPSIDE.
 *
 * Three layers, mirroring the brief's three scopes:
 *   1. The pure curve: `updateServiceEma` + `bufferServiceFactor` are one curve
 *      spanning [PRODUCTIVITY_FLOOR, PRODUCTIVITY_BONUS_CEIL] — throttling above the
 *      fill knee, rewarding sustained service below it. Never 0 (cozy rule #9).
 *   2. ProductionSystem: a served building (buffer drained each cycle) measurably
 *      outproduces a starved one; a building that never actually PRODUCES never
 *      accrues service credit.
 *   3. `arrivalFactor`: service coverage re-weights the immigration roll inside its
 *      original 0.7..1.0 band.
 *
 * The integration tests drive ProductionSystem directly with hand-set runtime state
 * (same pattern as production.test.ts), so nothing else touches the buffer.
 */
import { describe, it, expect } from "vitest";
import { bootstrapSim } from "../sim-bootstrap";
import {
  ProductionSystem,
  bufferThrottleFactor,
  bufferServiceFactor,
  updateServiceEma,
  outputBufferCap,
  SERVICE_BONUS_BAND,
  PRODUCTIVITY_BONUS_CEIL,
} from "./production";
import { arrivalFactor } from "./immigration";
import { getProductionDef, effectiveOutputPerCycle } from "../entities/building";
import type { SimState } from "../sim-state";

const SEED = 0xc17ade1;
const TICKS_PER_DAY = 20;
const MAX_DAYS = 100;
const FLOOR = 0.6;

/** A staffed, connected woodcutter (output 2/cycle, no seasonal multiplier). */
function spawnWoodcutter(state: SimState, x: number, y: number): number {
  const e = state.buildingWorld.spawn({
    building: { type: "woodcutter", x, y, w: 2, h: 2, ownerId: 0 },
  });
  state.buildingState.set(e.id!, {
    outputBuffer: 0,
    workerCount: 1,
    connected: true,
    productionTick: -1000,
    level: 1,
  });
  return e.id!;
}

function freshState(): SimState {
  const state = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: MAX_DAYS }).state;
  state.players[0]!.happiness = 100; // isolate the service curve from the happiness throttle
  return state;
}

describe("updateServiceEma — the rolling service signal", () => {
  it("climbs toward 1 while the buffer is drained (fill 0), never overshoots", () => {
    let ema = 0;
    for (let i = 0; i < 200; i++) ema = updateServiceEma(ema, 0);
    expect(ema).toBeGreaterThan(0.99);
    expect(ema).toBeLessThanOrEqual(1);
  });

  it("decays toward 0 while the buffer stays full (fill 1)", () => {
    let ema = 1;
    for (let i = 0; i < 200; i++) ema = updateServiceEma(ema, 1);
    expect(ema).toBeLessThan(0.01);
    expect(ema).toBeGreaterThanOrEqual(0);
  });

  it("is SUSTAINED: one drained cycle does not clear the bonus band", () => {
    expect(updateServiceEma(0, 0)).toBeLessThan(SERVICE_BONUS_BAND);
  });

  it("clamps out-of-range fill instead of running away", () => {
    expect(updateServiceEma(0.5, 5)).toBeGreaterThanOrEqual(0);
    expect(updateServiceEma(0.5, -5)).toBeLessThanOrEqual(1);
  });
});

describe("bufferServiceFactor — ONE curve, throttle and bonus never fight", () => {
  const cap = 10; // knee at fill 0.6 → buffer 6

  it("above the knee it IS the Phase H throttle — a backed-up buffer earns no bonus", () => {
    for (const buffer of [7, 8, 9, 10]) {
      expect(bufferServiceFactor(buffer, cap, 1)).toBeCloseTo(bufferThrottleFactor(buffer, cap), 10);
      expect(bufferServiceFactor(buffer, cap, 1)).toBeLessThanOrEqual(1);
    }
  });

  it("below the knee an unproven building runs at exactly 1.0 (no penalty, no bonus)", () => {
    expect(bufferServiceFactor(0, cap, 0)).toBeCloseTo(1, 10);
    expect(bufferServiceFactor(0, cap, SERVICE_BONUS_BAND)).toBeCloseTo(1, 10);
  });

  it("below the knee a perfectly-served building hits the ceiling", () => {
    expect(bufferServiceFactor(0, cap, 1)).toBeCloseTo(PRODUCTIVITY_BONUS_CEIL, 10);
  });

  it("ramps smoothly across the bonus band, never stepping", () => {
    let prev = -Infinity;
    for (let i = 0; i <= 100; i++) {
      const f = bufferServiceFactor(0, cap, SERVICE_BONUS_BAND + (i / 100) * (1 - SERVICE_BONUS_BAND));
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
    expect(prev).toBeCloseTo(PRODUCTIVITY_BONUS_CEIL, 10);
  });

  it("stays inside [floor, ceil] for every buffer × ema — the cozy floor holds", () => {
    for (let buffer = 0; buffer <= cap; buffer++) {
      for (let e = 0; e <= 10; e++) {
        const f = bufferServiceFactor(buffer, cap, e / 10);
        expect(f).toBeGreaterThanOrEqual(FLOOR);
        expect(f).toBeLessThanOrEqual(PRODUCTIVITY_BONUS_CEIL);
      }
    }
  });

  it("delivers the brief's 2.08x thriving-vs-starved spread", () => {
    const thriving = bufferServiceFactor(0, cap, 1);
    const starved = bufferServiceFactor(cap, cap, 0);
    expect(thriving / starved).toBeCloseTo(PRODUCTIVITY_BONUS_CEIL / FLOOR, 6);
    expect(thriving / starved).toBeGreaterThan(2);
  });
});

describe("ProductionSystem — a served building outproduces a starved one", () => {
  /**
   * A production clock that survives across calls. The cycle timer compares
   * `ctx.tick - rs.productionTick`, so a second run must continue the tick sequence
   * where the first left off, or no cycle ever fires again.
   */
  function makeClock(state: SimState, id: number) {
    const prod = new ProductionSystem(state);
    const def = getProductionDef("woodcutter")!;
    let tick = 0;
    /**
     * Run `cycles` production cycles, returning the goods emitted. `drain` empties the
     * buffer after each one, standing in for a hauler that reliably collects (the
     * served case); without it the buffer fills to its cap and the throttle takes over
     * (the starved case). `pinEma` holds the EWMA at a fixed value each cycle.
     */
    return function run(cycles: number, drain: boolean, pinEma?: number): number {
      let total = 0;
      for (let c = 0; c < cycles; c++) {
        const rs = state.buildingState.get(id)!;
        if (pinEma !== undefined) rs.serviceEma = pinEma;
        const before = rs.outputBuffer;
        prod.run({ tick });
        tick += def.ticksPerCycle;
        total += rs.outputBuffer - before;
        if (drain) rs.outputBuffer = 0;
      }
      return total;
    };
  }

  it("the served one emits measurably more over a sustained run", () => {
    const served = freshState();
    const servedId = spawnWoodcutter(served, 14, 14);
    const servedTotal = makeClock(served, servedId)(60, true);

    const starved = freshState();
    const starvedId = spawnWoodcutter(starved, 14, 14);
    const starvedTotal = makeClock(starved, starvedId)(60, false);

    expect(servedTotal).toBeGreaterThan(starvedTotal);
    // The served building proves itself and rides the bonus; the starved one backs up
    // to its cap and trickles at the floor.
    expect(served.buildingState.get(servedId)!.serviceEma ?? 0).toBeGreaterThan(SERVICE_BONUS_BAND);
    expect(starved.buildingState.get(starvedId)!.serviceEma ?? 0).toBeLessThan(SERVICE_BONUS_BAND);
  });

  it("a served building eventually beats its own un-bonused base rate", () => {
    const state = freshState();
    const id = spawnWoodcutter(state, 14, 14);
    const run = makeClock(state, id);
    const base = effectiveOutputPerCycle(getProductionDef("woodcutter")!, 1); // 2/cycle

    // Warm the EWMA into the bonus band, then measure a clean stretch.
    run(40, true);
    expect(state.buildingState.get(id)!.serviceEma!).toBeGreaterThan(SERVICE_BONUS_BAND);

    const cycles = 40;
    const emitted = run(cycles, true);
    expect(emitted).toBeGreaterThan(base * cycles); // the 1.25x actually pays out
  });

  it("the remainder carry makes a fractional multiplier mean what it says", () => {
    // 2/cycle at the full 1.25x ceiling = 2.5/cycle. Flooring per-cycle would emit 2;
    // carrying the remainder averages 2.5 over time.
    const state = freshState();
    const id = spawnWoodcutter(state, 14, 14);
    const cycles = 40;
    const emitted = makeClock(state, id)(cycles, true, 1); // pin the EWMA at the ceiling
    expect(emitted / cycles).toBeCloseTo(2.5, 1);
  });

  it("a starved converter never accrues service credit (an empty buffer it never filled)", () => {
    // A bakery with no flour `continue`s before emitting. Its buffer is empty, but
    // that is starvation, not service — it must not read as well-served.
    const state = freshState();
    state.players[0]!.stockpiles.flour = 0;
    const e = state.buildingWorld.spawn({
      building: { type: "bakery", x: 20, y: 20, w: 2, h: 2, ownerId: 0 },
    });
    state.buildingState.set(e.id!, {
      outputBuffer: 0,
      workerCount: 1,
      connected: true,
      productionTick: -1000,
      level: 1,
    });

    const prod = new ProductionSystem(state);
    for (let tick = 0; tick < 2000; tick++) prod.run({ tick });

    const rs = state.buildingState.get(e.id!)!;
    expect(rs.outputBuffer).toBe(0); // it never baked anything
    expect(rs.serviceEma ?? 0).toBeLessThan(SERVICE_BONUS_BAND); // ...so it is not "served"
  });

  it("never goes dark: a chronically unserved building still trickles at the floor", () => {
    const state = freshState();
    const id = spawnWoodcutter(state, 14, 14);
    const rs = state.buildingState.get(id)!;
    const def = getProductionDef("woodcutter")!;
    const cap = outputBufferCap(effectiveOutputPerCycle(def, 1));

    // Park the buffer one short of its cap: maximum throttle, still some headroom.
    rs.outputBuffer = cap - 1;
    rs.serviceEma = 0;
    const prod = new ProductionSystem(state);
    prod.run({ tick: 0 });

    expect(rs.outputBuffer).toBe(cap); // it emitted 1, not 0
    expect(rs.outputBuffer).toBeLessThanOrEqual(cap); // and never overflows
  });
});

describe("arrivalFactor — service coverage re-weights growth inside the old band", () => {
  it("stays within 0.7..1.0 across the whole input space", () => {
    for (let h = 0; h <= 100; h += 5) {
      for (let s = 0; s <= 1; s += 0.05) {
        const f = arrivalFactor(h, s);
        expect(f).toBeGreaterThanOrEqual(0.7);
        expect(f).toBeLessThanOrEqual(1);
      }
    }
  });

  it("a perfectly-served town out-attracts an unserved one at equal happiness", () => {
    expect(arrivalFactor(80, 1)).toBeGreaterThan(arrivalFactor(80, 0));
    expect(arrivalFactor(80, 1) - arrivalFactor(80, 0)).toBeCloseTo(0.1, 10);
  });

  it("a stocked-but-stagnant town stops attracting people at the old ceiling", () => {
    // Happiness alone can no longer reach certainty — service carries the last 0.1.
    expect(arrivalFactor(100, 0)).toBeCloseTo(0.9, 10);
    expect(arrivalFactor(100, 1)).toBeCloseTo(1.0, 10);
  });

  it("holds the 0.7 baseline for a miserable, unserved town", () => {
    expect(arrivalFactor(0, 0)).toBeCloseTo(0.7, 10);
  });

  it("clamps out-of-range inputs", () => {
    expect(arrivalFactor(-50, -1)).toBeCloseTo(0.7, 10);
    expect(arrivalFactor(500, 5)).toBeCloseTo(1.0, 10);
  });
});
