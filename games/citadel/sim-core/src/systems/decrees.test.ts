/**
 * Citadel 09 tests — interlocking decree payoffs (tithe + conscription).
 *
 * TITHE  = daily goods siphon → relief reserve; reserve cushions starvation.
 * CONSCRIPTION = raid-time defense boost.
 *
 * Cozy-pivot Phase G RETIRED the `setDecree` player lever: nothing enqueues a
 * `setDecree` command any more (it is silently ignored), and the conscription
 * PRODUCTION-halt was deleted from ProductionSystem. The underlying `activeDecrees`
 * branches in ImmigrationSystem (tithe) and SiegeResolutionSystem (conscription)
 * still exist as (now dead) code paths, so these tests exercise them by mutating
 * `activeDecrees` DIRECTLY rather than via a command.
 *
 * All tests drive bootstrapSim() directly (no Worker). Where a tightly
 * controlled scenario is needed we mutate sim.state and runtime state directly,
 * then tick the scheduler — the canonical way to exercise sim behavior headless.
 */
import { describe, it, expect } from "vitest";
import { localPlayer } from "../sim-state";
import { bootstrapSim } from "../sim-bootstrap";
import { totalGoods } from "../sim-state";
import { computeDefensiveStrength } from "./siege-resolution";
import type { RaiderState } from "../sim-state";

const SEED = 0xc17ade1;
const TICKS_PER_DAY = 20;

function boot(seed = SEED) {
  return bootstrapSim({ seed, ticksPerDay: TICKS_PER_DAY });
}

/** Tick the scheduler across [from, to). */
function tickRange(sim: ReturnType<typeof boot>, from: number, to: number): void {
  for (let tick = from; tick < to; tick++) sim.scheduler.tick({ tick });
}

/** A bare raider parked off-map — present in state.raiders but resolves nothing. */
function dummyRaider(id: number): RaiderState {
  return { id, x: 0, y: 0, tileX: 0, tileY: 0, path: [], pathStep: 0, strength: 10, resolved: false };
}

/**
 * Spawn `n` idle villager entities directly into the villager world and set
 * population to match. The starvation path removes real ECS entities, so a bare
 * `state.population` counter is not enough — there must be entities to remove.
 */
function seedVillagers(sim: ReturnType<typeof boot>, n: number): void {
  for (let i = 0; i < n; i++) {
    sim.state.villagerWorld.spawn({
      villager: {
        id: sim.state.nextVillagerId++,
        ownerId: 0,
        homeX: 1, homeY: 1, workX: 1, workY: 1, storeX: 1, storeY: 1,
        fsm: "idle", pathX: [], pathY: [], pathStep: 0,
        carryGood: null, carryAmount: 0, ticksAtWork: 0,
      },
    });
  }
  localPlayer(sim.state).population = n;
}

// ---------------------------------------------------------------------------
// 1. TITHE siphon: goods move from stockpiles into the relief reserve daily.
// ---------------------------------------------------------------------------
describe("Citadel 09 — tithe siphon", () => {
  it("siphons 10% of each stored good into the relief reserve at a day boundary", () => {
    const sim = boot();
    localPlayer(sim.state).activeDecrees.add("tithe");

    // Seed the global pool with goods (population 0 → no consumption to confound).
    localPlayer(sim.state).stockpiles.grain = 100;
    localPlayer(sim.state).stockpiles.wood = 50;
    localPlayer(sim.state).stockpiles.bread = 30;

    // Tick across two day boundaries. ImmigrationSystem establishes a baseline on
    // the first observed day boundary, then siphons on subsequent ones.
    tickRange(sim, 0, 3 * TICKS_PER_DAY);

    // Reserve accumulated goods; the global pool dropped by the same amounts.
    expect(totalGoods(localPlayer(sim.state).reliefReserve)).toBeGreaterThan(0);
    expect(localPlayer(sim.state).reliefReserve.grain).toBeGreaterThan(0);
    // grain started at 100; with no consumption it can only have shrunk via tithe.
    expect(localPlayer(sim.state).stockpiles.grain).toBeLessThan(100);
    // Conservation: grain in pool + reserve never exceeds the original 100.
    expect(localPlayer(sim.state).stockpiles.grain + localPlayer(sim.state).reliefReserve.grain).toBeLessThanOrEqual(100);
    // Snapshot exposes the reserve total.
    expect(sim.getSnapshot().reliefReserve).toBe(totalGoods(localPlayer(sim.state).reliefReserve));
  });

  it("does NOT siphon when the tithe decree is inactive", () => {
    const sim = boot();
    localPlayer(sim.state).stockpiles.grain = 100;
    tickRange(sim, 0, 3 * TICKS_PER_DAY);
    expect(totalGoods(localPlayer(sim.state).reliefReserve)).toBe(0);
    expect(localPlayer(sim.state).stockpiles.grain).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// 2. TITHE starvation cushion: reserve bread covers a deficit before pop falls.
// ---------------------------------------------------------------------------
describe("Citadel 09 — tithe starvation cushion", () => {
  /**
   * Drive a single day boundary with the bread pool short of what the
   * population needs. We inspect the starvation-specific signals (foodSurplus,
   * hungerDays, "starved" events) — these are independent of the rng-driven
   * disease/morale hazards, so the only variable is the relief reserve.
   *
   * Note: ImmigrationSystem treats the FIRST observed day boundary as a baseline
   * (no consumption), so we run two day boundaries and read the second.
   */
  function deficitDay(opts: { tithe: boolean; reserveBread: number }) {
    const sim = boot();
    if (opts.tithe) {
      localPlayer(sim.state).activeDecrees.add("tithe");
    }
    seedVillagers(sim, 4); // 4 villagers → 4 bread/day needed
    localPlayer(sim.state).reliefReserve.bread = opts.reserveBread;
    // Day 0 boundary: baseline. Day 1 boundary: real consumption with 1 bread
    // available vs 4 needed → deficit of 3.
    localPlayer(sim.state).stockpiles.bread = 1;
    tickRange(sim, 0, TICKS_PER_DAY);   // baseline day
    localPlayer(sim.state).stockpiles.bread = 1;
    tickRange(sim, TICKS_PER_DAY, 2 * TICKS_PER_DAY); // deficit day
    return sim;
  }

  it("reserve bread absorbs a deficit that would otherwise register as starvation", () => {
    // WITHOUT a reserve: the deficit registers — foodSurplus negative, hunger rises.
    const without = deficitDay({ tithe: false, reserveBread: 0 });
    expect(localPlayer(without.state).foodSurplus).toBeLessThan(0);
    expect(localPlayer(without.state).hungerDays).toBe(1);

    // WITH tithe + a generous reserve: the cushion covers the gap — no deficit,
    // no hunger accrued, and reserve bread was actually drawn down.
    const withReserve = deficitDay({ tithe: true, reserveBread: 100 });
    expect(localPlayer(withReserve.state).foodSurplus).toBe(0);
    expect(localPlayer(withReserve.state).hungerDays).toBe(0);
    // Reserve bread was drawn down to cover the shortfall (a few loaves), but a
    // generous reserve is far from exhausted.
    expect(localPlayer(withReserve.state).reliefReserve.bread).toBeLessThan(100);
    expect(localPlayer(withReserve.state).reliefReserve.bread).toBeGreaterThan(90);
  });

  it("over repeated deficit days the cushion suppresses the starvation removal path", () => {
    // hungerDays only advances on a real (post-cushion) deficit and triggers a
    // "starved" removal at 3. We track the peak hungerDays and starvation events
    // across several deficit days — both are disease/morale-independent.
    function multiDay(tithe: boolean, reserveBread: number): { peakHunger: number; starvedEvents: number } {
      const sim = boot();
      if (tithe) localPlayer(sim.state).activeDecrees.add("tithe");
      seedVillagers(sim, 4);
      localPlayer(sim.state).reliefReserve.bread = reserveBread;
      let peakHunger = 0;
      let starved = 0;
      for (let day = 0; day < 6; day++) {
        localPlayer(sim.state).stockpiles.bread = 1;
        tickRange(sim, day * TICKS_PER_DAY, (day + 1) * TICKS_PER_DAY);
        peakHunger = Math.max(peakHunger, localPlayer(sim.state).hungerDays);
        // The hunger-removal event: cozy copy reads "left to find food … larder
        // is bare", sharp copy reads "starved". Match either so the test tracks
        // the removal regardless of the cozy toggle (boot() is cozy by default).
        for (const e of sim.state.events) if (e.includes("starved") || e.includes("larder is bare")) starved = 1;
      }
      return { peakHunger, starvedEvents: starved };
    }
    const without = multiDay(false, 0);
    const withReserve = multiDay(true, 1000);
    // Undefended town accrues hunger and a starvation removal.
    expect(without.peakHunger).toBeGreaterThan(0);
    expect(without.starvedEvents).toBe(1);
    // Cushioned town never registers post-cushion hunger nor a starvation event.
    expect(withReserve.peakHunger).toBe(0);
    expect(withReserve.starvedEvents).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. (Retired) TITHE barter sweetener — cozy-pivot Phase G removed the tithe-
//    gated barter bonus; trades now pay exactly the offer's receiveQty. The
//    tithe decree's starvation-cushion role is covered elsewhere.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 4. CONSCRIPTION defense: raid-time defense rises with conscription on.
// ---------------------------------------------------------------------------
describe("Citadel 09 — conscription defense", () => {
  it("raises defensive strength when a raid is active and conscription is on", () => {
    const sim = boot();
    localPlayer(sim.state).population = 12;
    localPlayer(sim.state).raiders.push(dummyRaider(1));

    // Conscription OFF → baseline (no defensive buildings → 0 here).
    const baseline = computeDefensiveStrength(sim.state, localPlayer(sim.state));

    localPlayer(sim.state).activeDecrees.add("conscription");
    const withConscription = computeDefensiveStrength(sim.state, localPlayer(sim.state));

    // floor(12 * 0.5) = 6 added.
    expect(withConscription).toBe(baseline + 6);
    expect(withConscription).toBeGreaterThan(baseline);
  });

  it("adds NO defense when conscription is on but no raid is active", () => {
    const sim = boot();
    localPlayer(sim.state).population = 12;
    localPlayer(sim.state).activeDecrees.add("conscription");
    // No raiders present.
    expect(computeDefensiveStrength(sim.state, localPlayer(sim.state))).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 5. (Retired) CONSCRIPTION production pause — cozy-pivot Phase G deleted the
//    conscription production-halt from ProductionSystem (no player lever sets
//    conscription any more; production never pauses for it). The conscription
//    DEFENSE term still exists (section 4) as a dead code path in siege-resolution.
// ---------------------------------------------------------------------------
