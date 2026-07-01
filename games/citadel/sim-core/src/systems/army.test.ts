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
  // cozyThreats:false — a future Challenge/MP mode is the intended home for
  // PvP armies (per the cozy-pivot brief), and it isolates this test's exact
  // tools-spent accounting from the unrelated PvE raid system, which (under
  // the cozy default) would otherwise pilfer goods from either player's own
  // keep independently of the PvP army attack these tests are exercising.
  const sim = bootstrapSim({ seed: 1, ticksPerDay: TPD, maxDays: 50, worldWidth: 96, worldHeight: 96, cozyThreats: false });
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
