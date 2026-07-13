/**
 * Citadel 09 / brief 103 scope 2 — the autonomous "sharp levers".
 *
 * TITHE  = daily goods siphon → relief reserve; reserve cushions starvation.
 * CONSCRIPTION = raid-time defense boost.
 *
 * Cozy-pivot Phase G RETIRED the `setDecree` player lever, and brief 103 scope 2
 * RE-POINTED the three residual `activeDecrees` branches onto autonomous inputs
 * gated on the SHARP ruleset (`cozyThreats:false`):
 *   - TITHE  (ImmigrationSystem): siphons automatically every day in sharp mode.
 *   - RATIONING (ImmigrationSystem): the 25% consumption cut auto-engages in sharp
 *     mode ONLY while the town is in bread deficit (breadNow < population).
 *   - CONSCRIPTION (SiegeResolutionSystem.computeDefensiveStrength): an active raid
 *     automatically calls up villagers in sharp mode.
 * Nothing reads `activeDecrees` in production any more, so these tests trigger the
 * effects via `cozyThreats:false` (+ the deficit / raid precondition each now needs)
 * and NOT via `activeDecrees.add(...)`. The COZY (default) path never runs any of
 * these branches — the cozy-mode assertions below are the byte-identity guards.
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
import { ImmigrationSystem } from "./immigration";
import type { RaiderState } from "../sim-state";

const SEED = 0xc17ade1;
const TICKS_PER_DAY = 20;

function boot(seed = SEED) {
  return bootstrapSim({ seed, ticksPerDay: TICKS_PER_DAY });
}

/** Sharp (Challenge) bootstrap — the ruleset that now arms the three levers. */
function bootSharp(seed = SEED) {
  return bootstrapSim({ seed, ticksPerDay: TICKS_PER_DAY, cozyThreats: false });
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
// 1. TITHE siphon (brief 103 scope 2): sharp mode auto-siphons 10% of stored
//    BREAD into the relief reserve daily. ONLY bread — the reserve buffers bread
//    famine, so other goods (grain/wood/…) are untouched.
// ---------------------------------------------------------------------------
describe("Citadel 09 — tithe siphon", () => {
  it("siphons 10% of stored BREAD (and only bread) into the relief reserve each day (sharp mode)", () => {
    // Brief 103 scope 2: the tithe now arms automatically in sharp mode; no
    // decree is added. Population 0 → no consumption, so the only thing that
    // moves bread is the tithe (deterministic floored arithmetic).
    const sim = bootSharp();
    localPlayer(sim.state).stockpiles.grain = 100;
    localPlayer(sim.state).stockpiles.wood = 50;
    localPlayer(sim.state).stockpiles.bread = 30;

    // Baseline on the first observed day boundary; then a siphon on days 1 and 2:
    //   day 1: floor(30 * 0.1) = 3 → bread 27, reserve.bread 3
    //   day 2: floor(27 * 0.1) = 2 → bread 25, reserve.bread 5
    tickRange(sim, 0, 3 * TICKS_PER_DAY);

    const p = localPlayer(sim.state);
    // Bread was siphoned: pool 30 → 25, reserve 0 → 5.
    expect(p.reliefReserve.bread).toBe(5);
    expect(p.stockpiles.bread).toBe(25);
    // Bread-only: grain and wood are NOT tithed — pool intact, reserve empty.
    expect(p.stockpiles.grain).toBe(100);
    expect(p.stockpiles.wood).toBe(50);
    expect(p.reliefReserve.grain).toBe(0);
    expect(p.reliefReserve.wood).toBe(0);
    // The reserve total is exactly the bread that was siphoned.
    expect(totalGoods(p.reliefReserve)).toBe(5);
    // Snapshot exposes the reserve total.
    expect(sim.getSnapshot().reliefReserve).toBe(5);
  });

  it("does NOT siphon in cozy mode — byte-identity guard", () => {
    // The cozy (default) ruleset never runs the tithe branch, so the relief
    // reserve stays empty and the pool is untouched (byte-identical baseline).
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
  // The starvation cushion is NOT cozy-gated (it fires whenever reliefReserve.bread
  // > 0, brief 103 scope 2 NOTE), so we seed the reserve DIRECTLY here and stay on
  // the cozy default. That isolates the cushion mechanism from how the reserve gets
  // filled (the now-sharp-only tithe, covered by the siphon test above) — and avoids
  // sharp-mode rationing perturbing the exact draw-down amounts asserted below.
  function deficitDay(reserveBread: number) {
    const sim = boot();
    seedVillagers(sim, 4); // 4 villagers → 4 bread/day needed
    localPlayer(sim.state).reliefReserve.bread = reserveBread;
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
    const without = deficitDay(0);
    expect(localPlayer(without.state).foodSurplus).toBeLessThan(0);
    expect(localPlayer(without.state).hungerDays).toBe(1);

    // WITH a generous reserve: the cushion covers the gap — no deficit,
    // no hunger accrued, and reserve bread was actually drawn down.
    const withReserve = deficitDay(100);
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
    function multiDay(reserveBread: number): { peakHunger: number; starvedEvents: number } {
      const sim = boot();
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
    const without = multiDay(0);
    const withReserve = multiDay(1000);
    // Undefended town accrues hunger and a starvation removal.
    expect(without.peakHunger).toBeGreaterThan(0);
    expect(without.starvedEvents).toBe(1);
    // Cushioned town never registers post-cushion hunger nor a starvation event.
    expect(withReserve.peakHunger).toBe(0);
    expect(withReserve.starvedEvents).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2b. RATIONING (brief 103 scope 2): a sharp-mode, DEFICIT-gated 25% cut to
//     bread consumption — an automatic famine response, not a permanent cut.
// ---------------------------------------------------------------------------
describe("brief 103 — autonomous rationing (sharp, deficit-gated)", () => {
  // Drive a STANDALONE ImmigrationSystem (cozy=`cozy`) over one baseline day + one
  // measured day, bypassing the full scheduler so sharp-mode threats (disease,
  // morale departures) can't perturb the population the consumption math reads.
  // With no bakery, production is 0, so foodSurplus == −(bread consumed), pinning
  // the exact consumption figure. Returns the measured-day player.
  function rationDay(cozy: boolean, pop: number, bread: number) {
    const sim = boot(); // the base sim is only a valid SimState host; we run our own system
    const imm = new ImmigrationSystem(sim.state, { cozy });
    const p = localPlayer(sim.state);
    p.happiness = 100; // keep the low-morale departure path from touching population
    sim.state.day = 0;
    p.population = pop;
    p.stockpiles.bread = bread;
    imm.run({ tick: 0 }); // baseline day → lastDayBreadStart = bread, no consumption
    sim.state.day = 1;
    p.population = pop;
    p.stockpiles.bread = bread;
    imm.run({ tick: 1 }); // measured day
    return p;
  }

  it("cuts consumption by 25% in sharp mode while in bread deficit", () => {
    // pop 8 needs 8 bread; only 6 on hand → deficit. Rationing engages:
    // floor(8 * 0.75) = 6 consumed. foodSurplus = 6 (produced 0) − 6 = −6; the
    // 6 loaves exactly cover rationed demand so the pool zeroes out.
    const p = rationDay(false, 8, 6);
    expect(p.foodSurplus).toBe(-6);
    expect(p.stockpiles.bread).toBe(0);
  });

  it("does NOT cut consumption in cozy mode even in deficit — byte-identity guard", () => {
    // Same deficit, cozy ruleset: no cut, full 8 consumed. foodSurplus = 0 − 8 = −8
    // (2 more than the rationed sharp case → the exact 25% saving).
    const p = rationDay(true, 8, 6);
    expect(p.foodSurplus).toBe(-8);
    expect(p.stockpiles.bread).toBe(0);
  });

  it("does NOT cut consumption in sharp mode when NOT in deficit", () => {
    // pop 8, 9 bread on hand → NOT a deficit (9 >= 8), so the cut stays off even in
    // sharp mode: full 8 consumed, 1 loaf remains. (A wrongful cut would consume 6
    // and leave 3.)
    const p = rationDay(false, 8, 9);
    expect(p.stockpiles.bread).toBe(1);
    expect(p.foodSurplus).toBe(-8);
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
  it("raises defensive strength when a raid is active in sharp mode", () => {
    // Brief 103 scope 2: conscription now arms on the sharp path (cozy arg = false)
    // whenever a raid is active — no decree is added.
    const sim = boot();
    localPlayer(sim.state).population = 12;
    localPlayer(sim.state).raiders.push(dummyRaider(1));

    // Cozy (cozy=true) → conscription never applies (no defensive buildings → 0).
    const baseline = computeDefensiveStrength(sim.state, localPlayer(sim.state), true);

    // Sharp (cozy=false) → an active raid calls up villagers.
    const withConscription = computeDefensiveStrength(sim.state, localPlayer(sim.state), false);

    // floor(12 * 0.5) = 6 added.
    expect(withConscription).toBe(baseline + 6);
    expect(withConscription).toBeGreaterThan(baseline);
  });

  it("adds NO defense in sharp mode when no raid is active", () => {
    const sim = boot();
    localPlayer(sim.state).population = 12;
    // Sharp mode, but no raiders present → the raid gate keeps the term off.
    expect(computeDefensiveStrength(sim.state, localPlayer(sim.state), false)).toBe(0);
  });

  it("adds NO defense in cozy mode even under an active raid — byte-identity guard", () => {
    const sim = boot();
    localPlayer(sim.state).population = 12;
    localPlayer(sim.state).raiders.push(dummyRaider(1));
    // Cozy ruleset never conscripts (no defensive buildings → 0), regardless of raid.
    expect(computeDefensiveStrength(sim.state, localPlayer(sim.state), true)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 5. (Retired) CONSCRIPTION production pause — cozy-pivot Phase G deleted the
//    conscription production-halt from ProductionSystem (no player lever sets
//    conscription any more; production never pauses for it). The conscription
//    DEFENSE term still exists (section 4) as a dead code path in siege-resolution.
// ---------------------------------------------------------------------------
