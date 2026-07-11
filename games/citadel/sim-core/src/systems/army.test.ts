/**
 * Citadel 32 — PvP armies. Drives bootstrapSim() directly (no Worker).
 *
 * Two-player setup is built by spawning buildings directly with explicit
 * ownerId (the placeBuilding command path attributes to the local player until
 * brief 35 routes commands per sender). The local player (0) is the attacker;
 * player 1 defends. Outcomes are deterministic (resolveSiege thresholds on
 * army strength vs the defender's defensiveStrength).
 */
import { describe, it, expect } from "vitest";
import { bootstrapSim } from "../sim-bootstrap";
import { makePlayerState } from "../sim-state";
import type { CitadelSimResult } from "../sim-bootstrap";

const TPD = 20;

/** Spawn a town-hall owned by `ownerId` at (x,y); set that player's anchor. */
function placeTownHall(sim: CitadelSimResult, ownerId: number, x: number, y: number): void {
  const e = sim.world.spawn({ building: { type: "town-hall", x, y, w: 3, h: 3, ownerId } });
  if (e.id !== undefined) {
    sim.state.buildingState.set(e.id, {
      outputBuffer: 0, workerCount: 0, connected: false, productionTick: 0, level: 1,
    });
  }
  const p = sim.state.players.find((q) => q.id === ownerId)!;
  p.keepPosition = { x: x + 1, y: y + 1 };
}

function boot() {
  // cozyThreats:false — it isolates this test's exact tools-spent accounting from
  // the unrelated PvE raid system, which (under the cozy default) would otherwise
  // pilfer goods from either player's own keep independently of the PvP army
  // attack these tests are exercising.
  //
  // enableArmy:true — EXPLICIT since decision #23 flipped the default to false.
  // Multiplayer is deprecated (#21), so lethal PvP has no consumer and `ArmySystem`
  // + the `launchAttack` handler are frozen. These tests are what proves the math is
  // *frozen and intact*, not quietly broken — they must opt in, not inherit.
  const sim = bootstrapSim({
    seed: 1, ticksPerDay: TPD, worldWidth: 96, worldHeight: 96,
    cozyThreats: false, enableArmy: true,
  });
  sim.state.players.push(makePlayerState(1));
  return sim;
}

describe("Citadel 32 — PvP armies", () => {
  it("a strong army sacks an enemy town hall → that player is eliminated", () => {
    const sim = boot();
    const p0 = sim.state.players[0]!;
    const p1 = sim.state.players[1]!;
    placeTownHall(sim, 0, 10, 10);
    placeTownHall(sim, 1, 40, 40);
    p0.stockpiles.tools = 100;

    expect(p1.gameOver).toBe(false);
    // Strong army (50) vs the town-hall's base defense (8) → "sacked".
    sim.commands.enqueue({ type: "launchAttack", payload: { targetX: 40, targetY: 40, strength: 50 } });
    for (let t = 0; t < 400; t++) sim.scheduler.tick({ tick: t });

    expect(p1.keepSacked).toBe(true);
    expect(p1.gameOver).toBe(true);        // eliminated
    expect(sim.state.armies.length).toBe(0); // army resolved + removed
    expect(p0.stockpiles.tools).toBe(50);   // 50 tools spent
  });

  it("a weak army is repelled by a town hall's defense (no elimination)", () => {
    const sim = boot();
    const p0 = sim.state.players[0]!;
    const p1 = sim.state.players[1]!;
    placeTownHall(sim, 0, 10, 10);
    placeTownHall(sim, 1, 40, 40);
    p0.stockpiles.tools = 100;

    // Weak army (4) vs town-hall defense 8 → 8 >= 4*1.5 → "repelled".
    sim.commands.enqueue({ type: "launchAttack", payload: { targetX: 40, targetY: 40, strength: 4 } });
    for (let t = 0; t < 400; t++) sim.scheduler.tick({ tick: t });

    expect(p1.gameOver).toBe(false);       // survived
    expect(p1.keepSacked).toBe(false);
    expect(sim.state.armies.length).toBe(0); // army resolved (repelled) + removed
  });

  it("rejects launching at your own building and when you can't afford it", () => {
    const sim = boot();
    const p0 = sim.state.players[0]!;
    placeTownHall(sim, 0, 10, 10);
    placeTownHall(sim, 1, 40, 40);

    // Can't afford (0 tools): no army spawns.
    p0.stockpiles.tools = 0;
    sim.commands.enqueue({ type: "launchAttack", payload: { targetX: 40, targetY: 40, strength: 10 } });
    sim.scheduler.tick({ tick: 0 });
    expect(sim.state.armies.length).toBe(0);

    // Friendly fire (target own town-hall): no army spawns.
    p0.stockpiles.tools = 100;
    sim.commands.enqueue({ type: "launchAttack", payload: { targetX: 10, targetY: 10, strength: 10 } });
    sim.scheduler.tick({ tick: 1 });
    expect(sim.state.armies.length).toBe(0);
    expect(p0.stockpiles.tools).toBe(100); // nothing spent
  });
});

// ---------------------------------------------------------------------------
// Decision #23 — armies are frozen. MP is deprecated (#21), so lethal PvP has no
// consumer. `ArmySystem` and `launchAttack` stay in the tree, unreached.
// ---------------------------------------------------------------------------
describe("Citadel — armies are frozen by default (decision #23)", () => {
  /** Same two-player setup as `boot()`, but at the DEFAULT (frozen) enableArmy. */
  function bootFrozen() {
    const sim = bootstrapSim({
      seed: 1, ticksPerDay: TPD, worldWidth: 96, worldHeight: 96,
      cozyThreats: false, // isolate from the PvE raid, as boot() does
    });
    sim.state.players.push(makePlayerState(1));
    return sim;
  }

  it("enableArmy defaults to false — a bare bootstrap registers no ArmySystem", () => {
    const sim = bootstrapSim({ seed: 1, ticksPerDay: TPD });
    expect(sim.state.armies).toEqual([]);
  });

  // The load-bearing one. `enableArmy:false` only unregisters ArmySystem; if the
  // handler were not ALSO gated, it would debit tools and push an ArmyState that
  // nothing ever resolves or removes — tools gone, state.armies unbounded.
  it("launchAttack is REJECTED, not silently queued: no tools spent, no army created", () => {
    const sim = bootFrozen();
    placeTownHall(sim, 0, 10, 10);
    placeTownHall(sim, 1, 40, 40);
    const p0 = sim.state.players[0]!;
    p0.stockpiles.tools = 100;

    // Target the DEFENDER's hall — the same command that sacks a town under
    // `enableArmy:true` in the suite above. Only the gate stops it here.
    sim.commands.enqueue({ type: "launchAttack", payload: { targetX: 40, targetY: 40, strength: 50 } });
    for (let t = 0; t < 400; t++) sim.scheduler.tick({ tick: t });

    expect(sim.state.armies.length).toBe(0);
    expect(p0.stockpiles.tools).toBe(100); // the debit never happened
  });

  it("repeated rejected launchAttacks never grow state.armies", () => {
    const sim = bootFrozen();
    placeTownHall(sim, 0, 10, 10);
    placeTownHall(sim, 1, 40, 40);
    sim.state.players[0]!.stockpiles.tools = 1000;
    for (let n = 0; n < 20; n++) {
      sim.commands.enqueue({ type: "launchAttack", payload: { targetX: 40, targetY: 40, strength: 5 } });
      sim.scheduler.tick({ tick: n });
    }
    expect(sim.state.armies.length).toBe(0);
    expect(sim.state.players[0]!.stockpiles.tools).toBe(1000);
  });

  // Brief 112's acceptance, inherited: freezing ArmySystem must not move the sim.
  // ArmySystem's only RNG use is `state.rng.fork('army-<id>')` INSIDE its per-army
  // loop, and named forks don't consume the parent stream — so with zero armies its
  // registration is observationally inert. Prove it rather than assume it.
  it("freezing ArmySystem is byte-identical in a one-player sim", () => {
    const run = (enableArmy: boolean) => {
      const sim = bootstrapSim({
        seed: 0xc0ffee, ticksPerDay: TPD, worldWidth: 96, worldHeight: 96, enableArmy,
      });
      for (let t = 0; t < TPD * 20; t++) sim.scheduler.tick({ tick: t });
      const p = sim.state.players[0]!;
      return JSON.stringify({
        day: sim.state.day,
        stockpiles: p.stockpiles,
        popCap: p.popCap,
        gameOver: p.gameOver,
        armies: sim.state.armies.length,
        buildings: [...sim.state.buildingState.values()].map((b) => b.level),
      });
    };
    expect(run(false)).toBe(run(true));
  });
});
