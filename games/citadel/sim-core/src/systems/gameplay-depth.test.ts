/**
 * Citadel gameplay-depth tests — the siege-variance / threat-consequence /
 * interlock + decree-counterplay slice (2026-06-26).
 *
 * Drives bootstrapSim() directly (no Worker) and exercises the new mechanics in
 * isolation by mutating state then ticking the scheduler — the canonical headless
 * way to test sim behavior. All paths are deterministic (seeded rng).
 */
import { describe, it, expect } from "vitest";
import { bootstrapSim } from "../sim-bootstrap";
import { localPlayer } from "../sim-state";
import { resolveSiege, computeDefensiveStrength } from "./siege-resolution";
import { TraderSystem } from "./trader";
import { createRng } from "@engine/core";
import type { RaiderState } from "../sim-state";

const SEED = 0xc17ade1;
const TICKS_PER_DAY = 20;

function boot() {
  return bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY });
}

function dummyRaider(id: number, strength = 10): RaiderState {
  return { id, x: 0, y: 0, tileX: 0, tileY: 0, path: [], pathStep: 0, strength, resolved: false };
}

// ---------------------------------------------------------------------------
// Siege variance — resolveSiege consumes its seeded rng (resolves P3#14) and
// produces real probability bands, not a fixed threshold.
// ---------------------------------------------------------------------------
describe("siege variance", () => {
  it("consumes the rng fork — the same inputs with different seeds can differ", () => {
    // At a mid ratio (defense == strength, ratio 1.0) outcomes are repel-leaning
    // but not guaranteed. Across many seeds we must see BOTH repelled and damage.
    const results = new Set<string>();
    for (let s = 0; s < 200; s++) {
      results.add(resolveSiege(10, 10, createRng(s).fork("siege")));
    }
    expect(results.has("repelled")).toBe(true);
    expect(results.has("damage")).toBe(true);
  });

  it("is deterministic — same seed + inputs → same result", () => {
    const a = resolveSiege(10, 8, createRng(123).fork("x"));
    const b = resolveSiege(10, 8, createRng(123).fork("x"));
    expect(a).toBe(b);
  });

  it("high defense overwhelmingly repels; weak defense overwhelmingly sacks", () => {
    let strongRepel = 0;
    let weakSack = 0;
    for (let s = 0; s < 200; s++) {
      if (resolveSiege(10, 30, createRng(s).fork("a")) === "repelled") strongRepel++;
      if (resolveSiege(30, 3, createRng(s).fork("b")) === "sacked") weakSack++;
    }
    expect(strongRepel).toBeGreaterThan(160); // ~90%+
    expect(weakSack).toBeGreaterThan(140);    // most fall
  });

  it("low raider morale shifts the odds toward the defender", () => {
    let highMoraleRepel = 0;
    let lowMoraleRepel = 0;
    for (let s = 0; s < 300; s++) {
      if (resolveSiege(10, 6, createRng(s).fork("a"), 100) === "repelled") highMoraleRepel++;
      if (resolveSiege(10, 6, createRng(s).fork("a"), 0) === "repelled") lowMoraleRepel++;
    }
    expect(lowMoraleRepel).toBeGreaterThan(highMoraleRepel);
  });
});

// ---------------------------------------------------------------------------
// Threat consequence — defensive pressure bonus scales defense with threat.
// ---------------------------------------------------------------------------
describe("threat consequence — defense pressure", () => {
  it("raises defensive strength under threat (and is a no-op at threat 0)", () => {
    const sim = boot();
    const p = localPlayer(sim.state);
    p.population = 20;
    p.raiders.push(dummyRaider(1));
    p.activeDecrees.add("conscription");

    p.threatLevel = 0;
    const calm = computeDefensiveStrength(sim.state, p);
    p.threatLevel = 100;
    const pressured = computeDefensiveStrength(sim.state, p);

    expect(pressured).toBeGreaterThan(calm); // +20% at threat 100
  });
});

// ---------------------------------------------------------------------------
// Disease → garrison interlock — sick conscripts desert.
// ---------------------------------------------------------------------------
describe("disease → conscription interlock", () => {
  it("an outbreak reduces the conscription defense term", () => {
    const sim = boot();
    const p = localPlayer(sim.state);
    p.population = 20;
    p.raiders.push(dummyRaider(1));
    p.activeDecrees.add("conscription");
    p.threatLevel = 0; // isolate the disease term from the pressure bonus

    const healthy = computeDefensiveStrength(sim.state, p);
    p.outbreakActive = true;
    p.sickVillagers = 10; // half sick
    const sick = computeDefensiveStrength(sim.state, p);

    expect(sick).toBeLessThan(healthy);
  });
});

// ---------------------------------------------------------------------------
// Festivals — AUTONOMOUS + SPATIAL (cozy-pivot Phase G).
//
// The old `festival` decree (bread cost + a timed happiness bump, ordered via
// `setDecree`) is RETIRED. Festivals are now a placement effect of the public
// square: homes in its SERVICE_RADII get a steady mood lift, no command, no cost.
// (The per-house + aggregate math is pinned in needs-happiness.test.ts; here we
// only confirm there is no longer a bread-spending festival lever.)
// ---------------------------------------------------------------------------
describe("festival (autonomous, no lever)", () => {
  it("a stray setDecree festival command is a no-op — no bread spent, no timed bump", () => {
    const sim = boot();
    const p = localPlayer(sim.state);
    p.stockpiles.bread = 20;

    // `setDecree` has no registered handler any more → CommandSystem drops it.
    sim.commands.enqueue({ type: "setDecree", payload: { decree: "festival", active: true } });
    sim.scheduler.tick({ tick: 0 });

    expect(p.stockpiles.bread).toBe(20); // bread was NOT spent
    expect(p.activeDecrees.has("festival")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Player-driven trading post (cozy-pivot Phase G) — offers are a deterministic,
// scarcity-responsive menu, available while a staffed+connected trading post is
// owned. No caravan schedule, no RNG.
// ---------------------------------------------------------------------------
describe("player-driven trading post", () => {
  // Drive TraderSystem directly against injected building runtime state. Running
  // the full scheduler would let RoadConnectivitySystem recompute `connected`
  // (no road laid → false) and clobber the injected staffing, defeating the test.
  const DAY_TICK = TICKS_PER_DAY; // first day boundary (tick % ticksPerDay === 0, tick !== 0)

  /** Spawn a trading post owned by the local player with the given runtime state. */
  function placeTradingPost(sim: ReturnType<typeof boot>, workerCount: number, connected: boolean): void {
    const e = sim.world.spawn({
      building: { type: "tradingpost", x: 20, y: 20, w: 3, h: 2, ownerId: localPlayer(sim.state).id },
    });
    if (e.id !== undefined) {
      sim.state.buildingState.set(e.id, {
        outputBuffer: 0, workerCount, connected, productionTick: 0, level: 1,
      });
    }
  }

  it("trade affordance stays closed while the trading post is unstaffed or disconnected", () => {
    const sim = boot();
    const p = localPlayer(sim.state);
    const trader = new TraderSystem(sim.state, TICKS_PER_DAY);

    placeTradingPost(sim, 0, false); // unstaffed + disconnected
    trader.run({ tick: DAY_TICK });
    expect(p.traderPresent).toBe(false);
    expect(p.traderOffers).toHaveLength(0);
  });

  it("offers the player's scarce goods in exchange for their plentiful ones", () => {
    const sim = boot();
    const p = localPlayer(sim.state);
    const trader = new TraderSystem(sim.state, TICKS_PER_DAY);
    placeTradingPost(sim, 1, true); // staffed + connected → open

    // Wood plentiful, bread scarce → the menu should GIVE wood, RECEIVE bread.
    p.stockpiles.wood = 200;
    p.stockpiles.bread = 0;
    trader.run({ tick: DAY_TICK });

    expect(p.traderPresent).toBe(true);
    expect(p.traderOffers.length).toBeGreaterThan(0);
    expect(p.traderOffers.length).toBeLessThanOrEqual(3);
    expect(p.traderOffers.some((o) => o.give === "wood")).toBe(true);
    expect(p.traderOffers.every((o) => o.receive !== "wood")).toBe(true);
  });

  it("offers are deterministic — same stockpiles yield the same menu (no RNG)", () => {
    const build = () => {
      const sim = boot();
      const p = localPlayer(sim.state);
      const trader = new TraderSystem(sim.state, TICKS_PER_DAY);
      placeTradingPost(sim, 1, true);
      p.stockpiles.wood = 200;
      p.stockpiles.stone = 120;
      p.stockpiles.bread = 0;
      p.stockpiles.tools = 1;
      trader.run({ tick: DAY_TICK });
      return p.traderOffers.map((o) => `${o.giveQty}${o.give}->${o.receiveQty}${o.receive}`).join("|");
    };
    expect(build()).toBe(build());
  });
});
