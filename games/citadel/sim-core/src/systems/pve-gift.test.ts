/**
 * Citadel 33 (per-player PvE RNG independence) + 34 (gift/transfer).
 *
 * 33: raiders + hazards are already per-player (brief 28). This asserts the
 * remaining acceptance — adding a second player does NOT perturb player 0's raid
 * schedule (each player has an independent seeded raid stream; player 0 keeps the
 * legacy stream). 34: a one-way gift moves goods sender→recipient.
 */
import { describe, it, expect } from "vitest";
import { bootstrapSim } from "../sim-bootstrap";
import { makePlayerState } from "../sim-state";
import type { CitadelSimResult } from "../sim-bootstrap";

const TPD = 20;

/** Bootstrap with N players, each given a keep anchor (so raids spawn per player). */
function bootKeeps(nPlayers: number): CitadelSimResult {
  const sim = bootstrapSim({ seed: 1, ticksPerDay: TPD, maxDays: 40, worldWidth: 96, worldHeight: 96 });
  for (let i = 1; i < nPlayers; i++) sim.state.players.push(makePlayerState(i));
  for (const p of sim.state.players) {
    const x = 10 + p.id * 24;
    const y = 10;
    sim.world.spawn({ building: { type: "keep", x, y, w: 3, h: 3, ownerId: p.id } });
    p.keepPosition = { x: x + 1, y: y + 1 };
  }
  return sim;
}

/** Player 0's raid-count trace over `days` (the schedule fingerprint). */
function p0RaidTrace(sim: CitadelSimResult, days: number): string {
  const trace: number[] = [];
  for (let t = 0; t < days * TPD; t++) {
    sim.scheduler.tick({ tick: t });
    trace.push(sim.state.players[0]!.raidCount);
  }
  return trace.join(",");
}

describe("Citadel 33 — per-player PvE RNG independence", () => {
  it("player 0's raid schedule is identical with or without a second player", () => {
    const solo = p0RaidTrace(bootKeeps(1), 25);
    const withRival = p0RaidTrace(bootKeeps(2), 25);
    expect(withRival).toBe(solo);
    // sanity: raids actually happened in the window
    expect(solo).toMatch(/[1-9]/);
  });

  it("each player accrues their own raids (PvE runs per player)", () => {
    const sim = bootKeeps(2);
    for (let t = 0; t < 25 * TPD; t++) sim.scheduler.tick({ tick: t });
    expect(sim.state.players[0]!.raidCount).toBeGreaterThan(0);
    expect(sim.state.players[1]!.raidCount).toBeGreaterThan(0);
  });
});

describe("Citadel 34 — gift / transfer", () => {
  it("moves goods sender→recipient and rejects unaffordable / self gifts", () => {
    const sim = bootstrapSim({ seed: 1, ticksPerDay: TPD, maxDays: 5, worldWidth: 64, worldHeight: 64 });
    sim.state.players.push(makePlayerState(1));
    const p0 = sim.state.players[0]!;
    const p1 = sim.state.players[1]!;
    p0.stockpiles.wood = 10;

    sim.commands.enqueue({ type: "gift", payload: { to: 1, good: "wood", amount: 6 } });
    sim.scheduler.tick({ tick: 0 });
    expect(p0.stockpiles.wood).toBe(4);
    expect(p1.stockpiles.wood).toBe(6);

    // Unaffordable → rejected, no change.
    sim.commands.enqueue({ type: "gift", payload: { to: 1, good: "wood", amount: 99 } });
    sim.scheduler.tick({ tick: 1 });
    expect(p0.stockpiles.wood).toBe(4);
    expect(p1.stockpiles.wood).toBe(6);

    // Self-gift → rejected.
    sim.commands.enqueue({ type: "gift", payload: { to: 0, good: "wood", amount: 1 } });
    sim.scheduler.tick({ tick: 2 });
    expect(p0.stockpiles.wood).toBe(4);
  });
});
