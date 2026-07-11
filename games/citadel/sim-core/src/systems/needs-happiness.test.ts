/**
 * Chunk 1 — per-house mood/coverage.
 *
 * NeedsHappinessSystem already computes per-house hasFaith/hasSafety/hasGoodsAccess
 * while aggregating coverage; these tests pin down that it now ALSO persists the
 * per-house result onto BuildingRuntimeState (lacksFaith/lacksSafety/lacksGoods +
 * a derived `mood`) without disturbing the town-aggregate outputs.
 *
 * Driven like the sibling sim-core system tests (villager-owner.test.ts):
 * construct a SimState via bootstrapSim, place buildings directly, run the system
 * at tick === ticksPerDay (the daily pass).
 */
import { describe, it, expect } from "vitest";
import { bootstrapSim } from "../sim-bootstrap";
import type { SimState } from "../sim-state";
import type { BuildingRuntimeState } from "../entities/building";
import { NeedsHappinessSystem } from "./needs-happiness";

const TICKS_PER_DAY = 20;

function addBuilding(
  state: SimState,
  type: string,
  x: number,
  y: number,
  w: number,
  h: number,
  ownerId = 0,
): number {
  const entity = state.buildingWorld.spawn({ building: { type, x, y, w, h, ownerId } });
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

function runDaily(state: SimState, day = 1): void {
  // tick must be a positive multiple of ticksPerDay for the daily pass to fire.
  new NeedsHappinessSystem(state, TICKS_PER_DAY).run({ tick: TICKS_PER_DAY * day });
}

/** Run the daily pass for `days` successive in-game days (tick = ticksPerDay*k). */
function runDays(state: SimState, days: number): void {
  for (let k = 1; k <= days; k++) runDaily(state, k);
}

describe("NeedsHappinessSystem — per-house mood/coverage", () => {
  it("a house inside a chapel radius has lacksFaith=false and higher mood than an uncovered house", () => {
    const sim = bootstrapSim({ seed: 1, ticksPerDay: TICKS_PER_DAY, worldWidth: 96, worldHeight: 96 });
    const state = sim.state;

    // Covered house next to a chapel (chapel radius = 8, Manhattan).
    const covered = addBuilding(state, "house", 20, 20, 2, 2); // centre (21,21)
    addBuilding(state, "chapel", 22, 20, 2, 2); // centre (23,21) → dist 2 ≤ 8
    // Identical house far from any service.
    const bare = addBuilding(state, "house", 60, 60, 2, 2);

    runDaily(state);

    const coveredRs = state.buildingState.get(covered)!;
    const bareRs = state.buildingState.get(bare)!;

    expect(coveredRs.lacksFaith).toBe(false);
    expect(bareRs.lacksFaith).toBe(true);
    expect(coveredRs.mood!).toBeGreaterThan(bareRs.mood!);
  });

  it("a fully-uncovered house has mood=40 (base) and all three lacksX=true", () => {
    const sim = bootstrapSim({ seed: 1, ticksPerDay: TICKS_PER_DAY, worldWidth: 96, worldHeight: 96 });
    const state = sim.state;
    const id = addBuilding(state, "house", 40, 40, 2, 2);

    runDaily(state);

    const rs = state.buildingState.get(id)!;
    expect(rs.lacksFaith).toBe(true);
    expect(rs.lacksSafety).toBe(true);
    expect(rs.lacksGoods).toBe(true);
    expect(rs.mood).toBe(40);
  });

  it("a public-square in range lifts a house's mood above an out-of-range house (autonomous festival)", () => {
    // Cozy-pivot Phase G: festivals are a spatial placement effect of the public
    // square (SERVICE_RADII 8, Manhattan) — no decree, no command. A home in reach
    // gets a steady mood lift over an otherwise-identical home out of reach.
    const sim = bootstrapSim({ seed: 1, ticksPerDay: TICKS_PER_DAY, worldWidth: 96, worldHeight: 96 });
    const state = sim.state;

    // House next to a public square (square centre (23,21), house centre (21,21) → dist 2 ≤ 8).
    const covered = addBuilding(state, "house", 20, 20, 2, 2);
    addBuilding(state, "public-square", 22, 20, 2, 2);
    // Identical house far from the square (and from every other service).
    const bare = addBuilding(state, "house", 60, 60, 2, 2);

    // Mood eases toward its target; run several days so the festival lift shows.
    runDays(state, 6);

    const coveredRs = state.buildingState.get(covered)!;
    const bareRs = state.buildingState.get(bare)!;
    // Neither has faith/safety/goods; the ONLY difference is the festival lift.
    expect(coveredRs.mood!).toBeGreaterThan(bareRs.mood!);
    // The bare house sits at base mood 40; the covered one is lifted above it.
    expect(bareRs.mood).toBe(40);
    expect(coveredRs.mood!).toBeGreaterThan(40);
  });

  it("a public-square in range raises the town-aggregate happiness", () => {
    // The aggregate happiness mirrors the per-house festival lift (× coverage).
    function settledHappiness(withSquare: boolean): number {
      const sim = bootstrapSim({ seed: 1, ticksPerDay: TICKS_PER_DAY, worldWidth: 96, worldHeight: 96 });
      const state = sim.state;
      addBuilding(state, "house", 20, 20, 2, 2);
      if (withSquare) addBuilding(state, "public-square", 22, 20, 2, 2);
      runDays(state, 12);
      return state.players[0]!.happiness;
    }
    expect(settledHappiness(true)).toBeGreaterThan(settledHappiness(false));
  });

  it("a fully-covered house (chapel+safety+market with goods in range) has mood=100 and all lacksX=false", () => {
    const sim = bootstrapSim({ seed: 1, ticksPerDay: TICKS_PER_DAY, worldWidth: 96, worldHeight: 96 });
    const state = sim.state;

    // Goods access requires stockpiled bread/grain AND a market in range.
    sim.stockpiles.grain = 10;

    const id = addBuilding(state, "house", 30, 30, 2, 2); // centre (31,31)
    addBuilding(state, "chapel", 32, 30, 2, 2);    // centre (33,31) dist 2
    addBuilding(state, "watchpost", 30, 32, 2, 2); // centre (31,33) dist 2
    addBuilding(state, "market", 32, 32, 2, 2);    // centre (33,33) dist 4

    // Phase B Chunk 1: mood now EASES toward its target (100) rather than
    // snapping; let it settle over several days to reach the cap.
    runDays(state, 12);

    const rs = state.buildingState.get(id)!;
    expect(rs.lacksFaith).toBe(false);
    expect(rs.lacksSafety).toBe(false);
    expect(rs.lacksGoods).toBe(false);
    expect(rs.mood).toBe(100);
  });
});

describe("NeedsHappinessSystem — stateful asymmetric happiness (Phase B Chunk 1)", () => {
  // Constants mirror the module's tuning (kept here so the asserted dynamics are
  // self-documenting; the system owns the single source of truth).
  const RECOVERY = 0.45;
  const DECAY = 0.3;

  function fullCoverage(state: SimState): number {
    // Place a house with chapel + safety + market in range and goods in stock so
    // the player's coverage is 1/1/1 → target happiness 100.
    state.players[0]!.stockpiles.grain = 10;
    const id = addBuilding(state, "house", 30, 30, 2, 2);
    addBuilding(state, "chapel", 32, 30, 2, 2);
    addBuilding(state, "watchpost", 30, 32, 2, 2);
    addBuilding(state, "market", 32, 32, 2, 2);
    return id;
  }

  it("happiness LAGS toward a sudden drop instead of snapping to the new target", () => {
    const sim = bootstrapSim({ seed: 1, ticksPerDay: TICKS_PER_DAY, worldWidth: 96, worldHeight: 96 });
    const state = sim.state;
    const p = state.players[0]!;

    // Day 1+: full coverage, let happiness climb to its high target (100).
    fullCoverage(state);
    runDays(state, 12);
    expect(p.happiness).toBe(100);

    // Now yank all goods: target falls (faith+safety still met, goods lost → 80).
    p.stockpiles.grain = 0;
    p.stockpiles.bread = 0;
    runDaily(state, 13);

    // It must NOT have snapped to the new target (80); it lags above it.
    expect(p.happiness).toBeGreaterThan(80);
    expect(p.happiness).toBeLessThan(100);
    // First-step ease: 100 + (80-100)*DECAY = 94.
    expect(p.happiness).toBe(Math.round(100 + (80 - 100) * DECAY));
  });

  it("recovers a typical dent to within ~1 of target in ~2-3 days (asymmetric)", () => {
    const sim = bootstrapSim({ seed: 1, ticksPerDay: TICKS_PER_DAY, worldWidth: 96, worldHeight: 96 });
    const state = sim.state;
    const p = state.players[0]!;

    // Settle at full coverage (target 100), then force a ~20-point dent.
    fullCoverage(state);
    runDays(state, 12);
    expect(p.happiness).toBe(100);
    p.happiness = 80; // a typical transient dent

    // Target is still 100; recover. Geometric: 80→89→94→97→98.4...
    runDaily(state, 13);
    runDaily(state, 14);
    const afterTwoDays = p.happiness;
    runDaily(state, 15);
    const afterThreeDays = p.happiness;

    // ~3 days lands within ~3 of target (and keeps closing).
    expect(100 - afterThreeDays).toBeLessThanOrEqual(3);
    expect(afterThreeDays).toBeGreaterThanOrEqual(afterTwoDays);
    expect(afterThreeDays).toBeLessThanOrEqual(100);
  });

  it("a drop falls SLOWER than the same-magnitude recovery rises (recover > decay)", () => {
    // Same 20-point gap: how far does one day's ease move up vs down?
    const recoverStep = Math.round(80 + (100 - 80) * RECOVERY) - 80; // rise from 80→target 100
    const decayStep = 100 - Math.round(100 + (80 - 100) * DECAY);    // fall from 100→target 80
    expect(recoverStep).toBeGreaterThan(decayStep);
  });

  it("per-house mood is likewise stateful — lags, doesn't snap", () => {
    const sim = bootstrapSim({ seed: 1, ticksPerDay: TICKS_PER_DAY, worldWidth: 96, worldHeight: 96 });
    const state = sim.state;
    const id = fullCoverage(state);

    // One day: mood eases from the freshRuntime seed (40) toward 100, not snap.
    runDaily(state, 1);
    const afterOne = state.buildingState.get(id)!.mood!;
    expect(afterOne).toBeGreaterThan(40);
    expect(afterOne).toBeLessThan(100);
    expect(afterOne).toBe(Math.round(40 + (100 - 40) * RECOVERY)); // 67

    // It keeps climbing over subsequent days (still stateful, monotone toward target).
    runDaily(state, 2);
    expect(state.buildingState.get(id)!.mood!).toBeGreaterThan(afterOne);
  });

  it("happiness and mood stay within 0..100 across many iterations of churn", () => {
    const sim = bootstrapSim({ seed: 1, ticksPerDay: TICKS_PER_DAY, worldWidth: 96, worldHeight: 96 });
    const state = sim.state;
    const p = state.players[0]!;
    const id = fullCoverage(state);

    for (let day = 1; day <= 40; day++) {
      // Alternate goods on/off to keep the target oscillating.
      if (day % 2 === 0) {
        p.stockpiles.grain = 10;
      } else {
        p.stockpiles.grain = 0;
        p.stockpiles.bread = 0;
      }
      runDaily(state, day);
      expect(p.happiness).toBeGreaterThanOrEqual(0);
      expect(p.happiness).toBeLessThanOrEqual(100);
      const mood = state.buildingState.get(id)!.mood!;
      expect(mood).toBeGreaterThanOrEqual(0);
      expect(mood).toBeLessThanOrEqual(100);
    }
  });

  it("houses-length-0 still eases happiness toward the low (coverage 0) target, not skip", () => {
    const sim = bootstrapSim({ seed: 1, ticksPerDay: TICKS_PER_DAY, worldWidth: 96, worldHeight: 96 });
    const state = sim.state;
    const p = state.players[0]!;
    // No houses at all → coverage 0, target = base 40 (no food/decree/festival).
    p.happiness = 100; // start high so we can see it ease DOWN, not snap
    runDaily(state, 1);
    p.faithCoverage; // coverage zeroed by the early return
    expect(p.faithCoverage).toBe(0);
    // Eased toward 40 (decay), did not snap: 100 + (40-100)*0.3 = 82.
    expect(p.happiness).toBe(Math.round(100 + (40 - 100) * DECAY));
    expect(p.happiness).toBeGreaterThan(40);
  });
});
