/**
 * ImmigrationSystem — the Wave 3.5 trickle floor (P1: the unrecoverable pop-6-7 attractor).
 *
 * The bug: post-founding immigration is gated on a positive daily bread surplus OR a
 * banked day of bread. A town whose one staffed bakery feeds its ~6 mouths break-even
 * (6 bread/day made, 6 eaten) has NEITHER — so the gate never opens, and a second
 * bakery it builds to escape sits unstaffed forever, because staffing it needs the
 * arrival the gate blocks. Left alone the pop pins at 6 for hundreds of days: an
 * unrecoverable attractor, which violates the downside rule (#9 — always recoverable).
 *
 * The fix ({@link shouldTrickleImmigrant} + its wiring): outside the founding window,
 * when the surplus gate is structurally blocked but the town is fed, has housing free,
 * and owns a connected unstaffed producer, one settler drips in every
 * IMMIGRATION_TRICKLE_DAYS — a day-count decision, no RNG, so a town that never trickles
 * is byte-identical.
 *
 * Two layers:
 *   1. The pure predicate — fires exactly on the deadlock signature, and stays off while
 *      starving / recently-starved / already-eligible / capped / spaced-out.
 *   2. The wiring — ImmigrationSystem driven day-by-day against a controlled break-even
 *      bread oracle: a held deadlock escapes; a genuine deficit is never rescued and the
 *      town still dies out (starvation stays lethal — the `starve` scenario invariant).
 */
import { describe, it, expect } from "vitest";
import { bootstrapSim } from "../sim-bootstrap";
import { ImmigrationSystem, shouldTrickleImmigrant } from "./immigration";
import { getProductionDef } from "../entities/building";
import type { SimState } from "../sim-state";

const SEED = 0xc17ade1;
const TICKS_PER_DAY = 20;

describe("shouldTrickleImmigrant — the trickle-floor decision (pure, no RNG)", () => {
  // The canonical deadlock: fed, break-even (surplus gate blocked), housing free, one
  // connected unstaffed building, no recent starvation, spacing elapsed.
  const deadlock = {
    hasCapacity: true,
    unstaffedBuildings: 1,
    fed: true,
    surplusEligible: false,
    daysSinceStarveDepart: Infinity,
    daysSinceLastTrickle: Infinity,
  };

  it("fires on the canonical deadlock signature", () => {
    expect(shouldTrickleImmigrant(deadlock)).toBe(true);
  });

  it("stays OFF while the town is in deficit (not fed) — starvation stays lethal", () => {
    expect(shouldTrickleImmigrant({ ...deadlock, fed: false })).toBe(false);
  });

  it("stays OFF in the grace window right after a hunger departure", () => {
    expect(shouldTrickleImmigrant({ ...deadlock, daysSinceStarveDepart: 0 })).toBe(false);
    expect(shouldTrickleImmigrant({ ...deadlock, daysSinceStarveDepart: 5 })).toBe(false);
    expect(shouldTrickleImmigrant({ ...deadlock, daysSinceStarveDepart: 6 })).toBe(true);
  });

  it("stays OFF when the normal surplus gate is already open (it is not a booster)", () => {
    expect(shouldTrickleImmigrant({ ...deadlock, surplusEligible: true })).toBe(false);
  });

  it("stays OFF when there is no housing headroom", () => {
    expect(shouldTrickleImmigrant({ ...deadlock, hasCapacity: false })).toBe(false);
  });

  it("stays OFF when nothing is sitting unstaffed (no hands needed)", () => {
    expect(shouldTrickleImmigrant({ ...deadlock, unstaffedBuildings: 0 })).toBe(false);
  });

  it("respects the spacing — it does not fire again until IMMIGRATION_TRICKLE_DAYS elapse", () => {
    expect(shouldTrickleImmigrant({ ...deadlock, daysSinceLastTrickle: 7 })).toBe(false);
    expect(shouldTrickleImmigrant({ ...deadlock, daysSinceLastTrickle: 8 })).toBe(true);
  });
});

/**
 * Spawn a connected, unstaffed producer of `type` (the idle building a trickle settler
 * would staff). ImmigrationSystem reads only `connected` + `workerCount` + the def, and
 * never re-runs connectivity, so a hand-set runtime state is a faithful stand-in for a
 * road-connected building (same pattern as service-economy.test's spawnWoodcutter).
 */
function spawnUnstaffed(state: SimState, type: string, x: number, y: number): void {
  const e = state.buildingWorld.spawn({ building: { type, x, y, w: 2, h: 2, ownerId: state.players[0]!.id } });
  state.buildingState.set(e.id!, { outputBuffer: 0, workerCount: 0, connected: true, productionTick: -1000, level: 1 });
}

/**
 * Seed `n` real villager entities and set the population to match, so removeOneVillager
 * has entities to despawn (a bare `population = n` would leave the hunger path a no-op).
 */
function seedVillagers(state: SimState, n: number): void {
  const p = state.players[0]!;
  for (let i = 0; i < n; i++) {
    state.villagerWorld.spawn({
      villager: {
        id: state.nextVillagerId++, ownerId: p.id,
        homeX: 40, homeY: 40, workX: 40, workY: 40, storeX: 40, storeY: 40,
        fsm: "idle", pathX: [], pathY: [], pathStep: 0,
        carryGood: null, carryAmount: 0, ticksAtWork: 0,
      },
    });
  }
  p.population = n;
}

/**
 * Drive ImmigrationSystem across `days` in-game days against a break-even bread oracle:
 * each day the stockpile is set to exactly the day's consumption, so `foodSurplus`
 * settles at `deficitPerDay` (0 = break-even, <0 = a genuine deficit). Returns the
 * population trace. This isolates the immigration logic from production/hauling/pathing
 * so the test observes ONLY what the arrival rules do.
 */
function driveImmigration(state: SimState, days: number, deficitPerDay: number): number[] {
  const imm = new ImmigrationSystem(state, { cozy: true });
  const p = state.players[0]!;
  const trace: number[] = [];
  for (let day = 0; day <= days; day++) {
    state.day = day;
    // day 0 only establishes the baseline (no consumption); from day 1 the town "produces"
    // exactly consumption + deficitPerDay bread, all consumed → foodSurplus === deficitPerDay.
    if (day > 0) p.stockpiles.bread = Math.max(0, p.population + deficitPerDay);
    imm.run({ tick: day * TICKS_PER_DAY });
    trace.push(p.population);
  }
  return trace;
}

describe("ImmigrationSystem — the break-even deadlock recovers, starvation stays lethal", () => {
  it("lifts a held break-even town out of the pop plateau via the trickle floor", () => {
    const state = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY }).state;
    const p = state.players[0]!;
    spawnUnstaffed(state, "bakery", 40, 40); // the connected, idle producer a settler staffs
    seedVillagers(state, 6);                  // the attractor value one bakery feeds
    p.popCap = 18;                            // housing headroom (2 more houses' worth)
    p.happiness = 60;                         // above the low-morale departure threshold
    p.stockpiles.bread = 0;

    const trace = driveImmigration(state, 44, 0); // break-even (surplus 0), 44 days

    // The founding window (DAYS_PER_YEAR=16 → ≈6 days) owns arrivals while it is open;
    // the trickle is a strictly POST-founding floor, so pop holds flat through it.
    expect(trace[6]).toBe(6);
    // Then one settler drips in every IMMIGRATION_TRICKLE_DAYS — steady, monotonic growth
    // out of the attractor the surplus gate alone could never escape.
    expect(p.population).toBeGreaterThanOrEqual(10);
    for (let i = 1; i < trace.length; i++) expect(trace[i]!).toBeGreaterThanOrEqual(trace[i - 1]!);
    expect(p.gameOver).toBe(false);
  });

  it("never trickles a genuinely starving town — it still dies out (gameOver)", () => {
    const state = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY }).state;
    const p = state.players[0]!;
    spawnUnstaffed(state, "bakery", 40, 40); // an idle producer AND housing headroom exist —
    seedVillagers(state, 6);                  // the ONLY thing missing is food. The trickle
    p.popCap = 18;                            // must not paper over that (starve stays lethal).
    p.happiness = 60;
    p.stockpiles.bread = 0;

    const trace = driveImmigration(state, 40, -3); // a real 3-bread/day deficit every day

    // Not fed ⇒ the trickle never fires (it never grows past its start), the deficit
    // drives hunger departures to pop 0, and a town that once had people and now has none
    // latches gameOver — starvation stays lethal even under the cozy contract (#3/#5/#9).
    expect(Math.max(...trace)).toBe(6); // it never grew — the trickle stayed off
    expect(p.gameOver).toBe(true);
  });

  it("premise check — bakery is a worker-slotted producer (the thing a settler staffs)", () => {
    const def = getProductionDef("bakery");
    expect(def?.workerSlots).toBeGreaterThan(0);
    expect(def?.outputPerCycle).toBeGreaterThan(0);
  });
});
