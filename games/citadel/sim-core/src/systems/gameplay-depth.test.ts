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
import { createRng } from "@engine/core";
import type { RaiderState } from "../sim-state";

const SEED = 0xc17ade1;
const TICKS_PER_DAY = 20;

function boot() {
  return bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: 100 });
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
// Decree counterplay — festival costs bread and lifts happiness; conscription
// is gated behind threat.
// ---------------------------------------------------------------------------
describe("decree counterplay", () => {
  it("a festival costs bread and raises happiness over the next days", () => {
    const sim = boot();
    const p = localPlayer(sim.state);
    p.stockpiles.bread = 20;

    sim.commands.enqueue({ type: "setDecree", payload: { decree: "festival", active: true } });
    sim.scheduler.tick({ tick: 0 });
    expect(p.stockpiles.bread).toBeLessThan(20); // bread was spent
    expect(p.festivalDaysLeft).toBeGreaterThan(0);

    // Tick a day boundary so needs/happiness recompute with the festival active.
    p.population = 1; // one house-less villager won't fully cover needs → base-ish
    const before = p.happiness;
    for (let t = 1; t <= TICKS_PER_DAY; t++) sim.scheduler.tick({ tick: t });
    expect(p.happiness).toBeGreaterThanOrEqual(before);
  });

  it("conscription is blocked when threat is low and no raid is active", () => {
    const sim = boot();
    const p = localPlayer(sim.state);
    p.threatLevel = 0;
    expect(p.raiders.length).toBe(0);

    sim.commands.enqueue({ type: "setDecree", payload: { decree: "conscription", active: true } });
    sim.scheduler.tick({ tick: 0 });
    expect(p.activeDecrees.has("conscription")).toBe(false); // gated out
  });

  it("conscription is allowed once threat is high", () => {
    const sim = boot();
    const p = localPlayer(sim.state);
    p.threatLevel = 80;
    sim.commands.enqueue({ type: "setDecree", payload: { decree: "conscription", active: true } });
    sim.scheduler.tick({ tick: 0 });
    expect(p.activeDecrees.has("conscription")).toBe(true);
  });

  it("stacking strain decrees hurts more than the sum of parts", () => {
    // Compare happiness with one strain decree vs three. The third decree should
    // cost more than its base penalty thanks to the stacking term.
    function happinessWith(decrees: string[]): number {
      const sim = boot();
      const p = localPlayer(sim.state);
      for (const d of decrees) p.activeDecrees.add(d);
      for (let t = 1; t <= TICKS_PER_DAY; t++) sim.scheduler.tick({ tick: t });
      return p.happiness;
    }
    const one = happinessWith(["rationing"]);
    const three = happinessWith(["rationing", "tithe", "workHours"]);
    // base penalties: 10 vs 30; stacking adds (3-1)*3 = 6 more → gap > 20.
    expect(one - three).toBeGreaterThan(20);
  });
});

// ---------------------------------------------------------------------------
// Trader dynamic pricing — offers respond to the player's stockpiles.
// ---------------------------------------------------------------------------
describe("trader dynamic pricing", () => {
  it("offers the player's scarce goods in exchange for their plentiful ones", () => {
    const sim = boot();
    const p = localPlayer(sim.state);
    // Place a trading post so the caravan schedules + arrives over ~10 days.
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "tradingpost", x: 20, y: 20 } });
    sim.scheduler.tick({ tick: 0 });

    // Hold wood very plentiful and bread very scarce across the run so that when
    // the caravan arrives its offers are generated against this scarcity profile.
    let tick = 1;
    let arrived = false;
    for (let day = 0; day < 14 && !arrived; day++) {
      for (let t = 0; t < TICKS_PER_DAY; t++, tick++) {
        p.stockpiles.wood = 200;
        p.stockpiles.bread = 0;
        sim.scheduler.tick({ tick });
        if (p.traderPresent) { arrived = true; break; }
      }
    }

    expect(arrived).toBe(true);
    expect(p.traderOffers.length).toBeGreaterThan(0);
    // The player should be asked to GIVE a plentiful good and RECEIVE a scarce one;
    // wood (plentiful) must appear as a `give`, and never as a `receive`.
    expect(p.traderOffers.some((o) => o.give === "wood")).toBe(true);
    expect(p.traderOffers.every((o) => o.receive !== "wood")).toBe(true);
  });
});
