/**
 * Citadel 09 tests — interlocking decree payoffs (tithe + conscription).
 *
 * TITHE  = daily goods siphon → relief reserve; reserve cushions starvation
 *          and sweetens Trading Post barter terms.
 * CONSCRIPTION = raid-time defense boost at the cost of paused production.
 *
 * All tests drive bootstrapSim() directly (no Worker). Where a tightly
 * controlled scenario is needed we mutate sim.state and runtime state directly,
 * then tick the scheduler — the canonical way to exercise sim behavior headless.
 */
import { describe, it, expect } from "vitest";
import { bootstrapSim } from "../sim-bootstrap";
import { totalGoods } from "../sim-state";
import { computeDefensiveStrength } from "./siege-resolution";
import type { RaiderState } from "../sim-state";

const SEED = 0xc17ade1;
const TICKS_PER_DAY = 20;
const MAX_DAYS = 100;

function boot(seed = SEED) {
  return bootstrapSim({ seed, ticksPerDay: TICKS_PER_DAY, maxDays: MAX_DAYS });
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
        homeX: 1, homeY: 1, workX: 1, workY: 1, storeX: 1, storeY: 1,
        fsm: "idle", pathX: [], pathY: [], pathStep: 0,
        carryGood: null, carryAmount: 0, ticksAtWork: 0,
      },
    });
  }
  sim.state.population = n;
}

// ---------------------------------------------------------------------------
// 1. TITHE siphon: goods move from stockpiles into the relief reserve daily.
// ---------------------------------------------------------------------------
describe("Citadel 09 — tithe siphon", () => {
  it("siphons 10% of each stored good into the relief reserve at a day boundary", () => {
    const sim = boot();
    sim.commands.enqueue({ type: "setDecree", payload: { decree: "tithe", active: true } });

    // Seed the global pool with goods (population 0 → no consumption to confound).
    sim.state.stockpiles.grain = 100;
    sim.state.stockpiles.wood = 50;
    sim.state.stockpiles.bread = 30;

    // Tick across two day boundaries. ImmigrationSystem establishes a baseline on
    // the first observed day boundary, then siphons on subsequent ones.
    tickRange(sim, 0, 3 * TICKS_PER_DAY);

    // Reserve accumulated goods; the global pool dropped by the same amounts.
    expect(totalGoods(sim.state.reliefReserve)).toBeGreaterThan(0);
    expect(sim.state.reliefReserve.grain).toBeGreaterThan(0);
    // grain started at 100; with no consumption it can only have shrunk via tithe.
    expect(sim.state.stockpiles.grain).toBeLessThan(100);
    // Conservation: grain in pool + reserve never exceeds the original 100.
    expect(sim.state.stockpiles.grain + sim.state.reliefReserve.grain).toBeLessThanOrEqual(100);
    // Snapshot exposes the reserve total.
    expect(sim.getSnapshot().reliefReserve).toBe(totalGoods(sim.state.reliefReserve));
  });

  it("does NOT siphon when the tithe decree is inactive", () => {
    const sim = boot();
    sim.state.stockpiles.grain = 100;
    tickRange(sim, 0, 3 * TICKS_PER_DAY);
    expect(totalGoods(sim.state.reliefReserve)).toBe(0);
    expect(sim.state.stockpiles.grain).toBe(100);
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
      sim.commands.enqueue({ type: "setDecree", payload: { decree: "tithe", active: true } });
    }
    seedVillagers(sim, 4); // 4 villagers → 4 bread/day needed
    sim.state.reliefReserve.bread = opts.reserveBread;
    // Day 0 boundary: baseline. Day 1 boundary: real consumption with 1 bread
    // available vs 4 needed → deficit of 3.
    sim.state.stockpiles.bread = 1;
    tickRange(sim, 0, TICKS_PER_DAY);   // baseline day
    sim.state.stockpiles.bread = 1;
    tickRange(sim, TICKS_PER_DAY, 2 * TICKS_PER_DAY); // deficit day
    return sim;
  }

  it("reserve bread absorbs a deficit that would otherwise register as starvation", () => {
    // WITHOUT a reserve: the deficit registers — foodSurplus negative, hunger rises.
    const without = deficitDay({ tithe: false, reserveBread: 0 });
    expect(without.state.foodSurplus).toBeLessThan(0);
    expect(without.state.hungerDays).toBe(1);

    // WITH tithe + a generous reserve: the cushion covers the gap — no deficit,
    // no hunger accrued, and reserve bread was actually drawn down.
    const withReserve = deficitDay({ tithe: true, reserveBread: 100 });
    expect(withReserve.state.foodSurplus).toBe(0);
    expect(withReserve.state.hungerDays).toBe(0);
    // Reserve bread was drawn down to cover the shortfall (a few loaves), but a
    // generous reserve is far from exhausted.
    expect(withReserve.state.reliefReserve.bread).toBeLessThan(100);
    expect(withReserve.state.reliefReserve.bread).toBeGreaterThan(90);
  });

  it("over repeated deficit days the cushion suppresses the starvation removal path", () => {
    // hungerDays only advances on a real (post-cushion) deficit and triggers a
    // "starved" removal at 3. We track the peak hungerDays and starvation events
    // across several deficit days — both are disease/morale-independent.
    function multiDay(tithe: boolean, reserveBread: number): { peakHunger: number; starvedEvents: number } {
      const sim = boot();
      if (tithe) sim.commands.enqueue({ type: "setDecree", payload: { decree: "tithe", active: true } });
      seedVillagers(sim, 4);
      sim.state.reliefReserve.bread = reserveBread;
      let peakHunger = 0;
      let starved = 0;
      for (let day = 0; day < 6; day++) {
        sim.state.stockpiles.bread = 1;
        tickRange(sim, day * TICKS_PER_DAY, (day + 1) * TICKS_PER_DAY);
        peakHunger = Math.max(peakHunger, sim.state.hungerDays);
        for (const e of sim.state.events) if (e.includes("starved")) starved = 1;
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
// 3. TITHE better barter terms: a stocked reserve yields +1 received good.
// ---------------------------------------------------------------------------
describe("Citadel 09 — tithe better barter terms", () => {
  /**
   * Force a trader present with a known offer, then execute the same barter
   * with and without a stocked relief reserve and compare the received amount.
   * Offer 0: give 5 grain → receive 2 bread.
   */
  function barterReceive(opts: { tithe: boolean; reserve: number }): number {
    const sim = boot();
    if (opts.tithe) {
      sim.commands.enqueue({ type: "setDecree", payload: { decree: "tithe", active: true } });
      sim.scheduler.tick({ tick: 0 });
    }
    // Force trader state + a deterministic offer.
    sim.state.traderPresent = true;
    sim.state.traderOffers.length = 0;
    sim.state.traderOffers.push({ give: "grain", giveQty: 5, receive: "bread", receiveQty: 2 });
    sim.state.stockpiles.grain = 20;
    sim.state.stockpiles.bread = 0;
    // Stock the reserve above/below the barter threshold (20).
    sim.state.reliefReserve.grain = opts.reserve;

    const breadBefore = sim.state.stockpiles.bread;
    sim.commands.enqueue({ type: "barter", payload: { offerIndex: 0 } });
    sim.scheduler.tick({ tick: 1 });
    return sim.state.stockpiles.bread - breadBefore;
  }

  it("a sufficiently stocked reserve yields more received good than without", () => {
    const baseline = barterReceive({ tithe: false, reserve: 0 });   // no bonus → 2
    const boosted = barterReceive({ tithe: true, reserve: 50 });     // +1 bonus → 3
    expect(baseline).toBe(2);
    expect(boosted).toBe(3);
    expect(boosted).toBeGreaterThan(baseline);
  });

  it("the barter bonus does NOT apply below the reserve threshold", () => {
    const justUnder = barterReceive({ tithe: true, reserve: 10 }); // below threshold 20
    expect(justUnder).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 4. CONSCRIPTION defense: raid-time defense rises with conscription on.
// ---------------------------------------------------------------------------
describe("Citadel 09 — conscription defense", () => {
  it("raises defensive strength when a raid is active and conscription is on", () => {
    const sim = boot();
    sim.state.population = 12;
    sim.state.raiders.push(dummyRaider(1));

    // Conscription OFF → baseline (no defensive buildings → 0 here).
    const baseline = computeDefensiveStrength(sim.state);

    sim.state.activeDecrees.add("conscription");
    const withConscription = computeDefensiveStrength(sim.state);

    // floor(12 * 0.5) = 6 added.
    expect(withConscription).toBe(baseline + 6);
    expect(withConscription).toBeGreaterThan(baseline);
  });

  it("adds NO defense when conscription is on but no raid is active", () => {
    const sim = boot();
    sim.state.population = 12;
    sim.state.activeDecrees.add("conscription");
    // No raiders present.
    expect(computeDefensiveStrength(sim.state)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 5. CONSCRIPTION production pause: producers idle while a raid is active.
// ---------------------------------------------------------------------------
describe("Citadel 09 — conscription production pause", () => {
  /**
   * Stand up a single connected, staffed producer via direct runtime state, then
   * advance several production cycles. With conscription + a raid present, the
   * output buffer must NOT grow; otherwise it grows.
   */
  function producerGrowth(opts: { conscription: boolean; raid: boolean }): number {
    const sim = boot();
    // Place a mill (converter: 1 grain → 2 flour / 10-tick cycle). No terrain
    // requirement, no tier lock, no seasonal scaling — ideal for an isolated
    // production-pause probe. We keep grain topped up so input never gates it.
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "mill", x: 20, y: 20 } });
    sim.scheduler.tick({ tick: 0 });

    // Find its entity + runtime state and force it connected + staffed.
    let bid = -1;
    for (const entity of sim.world.query("building")) {
      if (entity.building.type === "mill" && entity.id !== undefined) bid = entity.id;
    }
    expect(bid).toBeGreaterThanOrEqual(0);
    const rs = sim.state.buildingState.get(bid)!;
    rs.connected = true;
    rs.workerCount = 1;
    rs.outputBuffer = 0;
    rs.productionTick = 0;

    if (opts.conscription) sim.state.activeDecrees.add("conscription");
    if (opts.raid) sim.state.raiders.push(dummyRaider(99));

    const before = rs.outputBuffer;
    // Advance several full production cycles (mill cycle = 10 ticks).
    for (let tick = 1; tick <= 100; tick++) {
      // Keep the producer connected/staffed + fed (no haulers in this scenario).
      rs.connected = true;
      rs.workerCount = 1;
      sim.state.stockpiles.grain += 10;
      sim.scheduler.tick({ tick });
    }
    return rs.outputBuffer - before;
  }

  it("output buffer does NOT grow during a raid under conscription", () => {
    const paused = producerGrowth({ conscription: true, raid: true });
    expect(paused).toBe(0);
  });

  it("output buffer DOES grow when there is no raid (conscription idle)", () => {
    const noRaid = producerGrowth({ conscription: true, raid: false });
    expect(noRaid).toBeGreaterThan(0);
  });

  it("output buffer DOES grow during a raid when conscription is off", () => {
    const noDecree = producerGrowth({ conscription: false, raid: true });
    expect(noDecree).toBeGreaterThan(0);
  });
});
