/**
 * Tests for the render-only `HollowAgentSnapshot.action` field (chunk
 * hollow-09a). Two things matter here:
 *
 *  1. The action LABEL derivation is itself deterministic — same seed,
 *     same sequence of per-agent action labels every tick.
 *  2. Reading `.action` (i.e. calling `getSnapshot()` and looking at agent
 *     actions, as a renderer would every tick) never perturbs the sim's own
 *     outputs — proving the field is genuinely write-only/observational,
 *     not something any deliberation/valuation/RNG path could be secretly
 *     coupled to. See components/agent.ts's `currentAction` doc for the
 *     write-only contract this guards.
 *
 * Tick budgets kept small (<=300) per repo convention for resource-scoped
 * sim tests.
 */
import { describe, it, expect } from "vitest";
import { bootstrapHollowSim, type HollowSnapshot } from "./sim-bootstrap";

const SEED = 0x1a1100;
const POPULATION = 16;
const TICKS = 200;

const VALID_ACTIONS = new Set([
  "idle",
  "walk",
  "eat",
  "work",
  "rest",
  "gift",
  "share",
  "help",
  "teach",
  "trade",
  "steal",
  "sabotage",
  "rumor",
  "attack",
]);

function actionSequence(seed: number, ticks: number): string[][] {
  const sim = bootstrapHollowSim({ seed, ticksPerDay: 20, population: POPULATION });
  const perTick: string[][] = [];
  for (let i = 0; i < ticks; i++) {
    sim.tick();
    const snap = sim.getSnapshot();
    // Sort by id so the sequence is comparable regardless of query order.
    const actions = [...snap.agents].sort((a, b) => a.id - b.id).map((a) => a.action);
    perTick.push(actions);
  }
  return perTick;
}

describe("HollowAgentSnapshot.action (chunk hollow-09a)", () => {
  it("is deterministic: same seed produces an identical per-tick action sequence across two independent runs", () => {
    const seqA = actionSequence(SEED, TICKS);
    const seqB = actionSequence(SEED, TICKS);
    expect(seqA).toEqual(seqB);
  });

  it("only ever emits labels from the documented coarse-action vocabulary", () => {
    const sim = bootstrapHollowSim({ seed: SEED, ticksPerDay: 20, population: POPULATION });
    for (let i = 0; i < TICKS; i++) sim.tick();
    const snap = sim.getSnapshot();
    for (const agent of snap.agents) {
      expect(VALID_ACTIONS.has(agent.action), `unexpected action label "${agent.action}"`).toBe(true);
    }
  });

  it("resets to a non-stale value every tick (not every agent is permanently stuck on one label)", () => {
    const sim = bootstrapHollowSim({ seed: SEED, ticksPerDay: 20, population: POPULATION });
    const seen = new Set<string>();
    for (let i = 0; i < TICKS; i++) {
      sim.tick();
      for (const agent of sim.getSnapshot().agents) seen.add(agent.action);
    }
    // Over 200 ticks of a live population (survival ladder always runs),
    // at least "walk" and one of "eat"/"work" must show up — proves the
    // label is actually being derived from live ACT-stage behavior, not a
    // constant stub.
    expect(seen.has("walk")).toBe(true);
    expect(seen.has("eat") || seen.has("work")).toBe(true);
  });

  it("reading the snapshot's .action every tick (as a renderer would) never perturbs the sim's own outputs", () => {
    // Run A: read getSnapshot() (and its .action field) every single tick,
    // like a live renderer polling the worker stream.
    const simA = bootstrapHollowSim({ seed: SEED, ticksPerDay: 20, population: POPULATION });
    const snapshotsA: HollowSnapshot[] = [];
    for (let i = 0; i < TICKS; i++) {
      simA.tick();
      snapshotsA.push(simA.getSnapshot());
    }

    // Run B: identical seed/options, but NEVER call getSnapshot() (so
    // .action is never read anywhere) until the very end.
    const simB = bootstrapHollowSim({ seed: SEED, ticksPerDay: 20, population: POPULATION });
    for (let i = 0; i < TICKS; i++) simB.tick();
    const finalB = simB.getSnapshot();

    const finalA = snapshotsA[snapshotsA.length - 1]!;
    expect(finalA.bornCount).toBe(finalB.bornCount);
    expect(finalA.diedCount).toBe(finalB.diedCount);
    expect(finalA.aliveCount).toBe(finalB.aliveCount);
    expect(finalA.householdCount).toBe(finalB.householdCount);
    expect(finalA.socialCounts).toEqual(finalB.socialCounts);

    // And the non-action per-agent fields (position, needs, stage) also
    // match exactly, agent-for-agent — reading .action mid-run changed
    // nothing about the simulated world.
    const stripAction = (s: HollowSnapshot) =>
      [...s.agents]
        .sort((a, b) => a.id - b.id)
        .map(({ action: _action, ...rest }) => rest);
    expect(stripAction(finalA)).toEqual(stripAction(finalB));
  });
});
