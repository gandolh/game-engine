/**
 * MateQuest sim-worker — the postMessage boundary (audit-28,
 * corpus/todos/2026-09-13-audit-28-mathquest-worker-tests.md). Mirrors Citadel's
 * `src/worker/sim-worker.test.ts` pattern: stub `self.postMessage`, import the module (which
 * wires `self.onmessage` as a side effect), then dispatch synthetic `WorkerInbound` messages
 * straight at that handler and inspect what got posted.
 *
 * audit-03 (commit 15f954e) deleted the 20 Hz `setInterval` snapshot pump — this file pins the
 * CURRENT post-conditions: `"init"` posts `ready` then exactly one `snapshot`, synchronously, in
 * that order; each of the 8 commands posts exactly one snapshot after calling its `sim.<method>`;
 * there is no timer of any kind, so idle time produces zero `postMessage` calls. Fake timers are
 * used to prove that last point, not because anything here is actually async — every dispatch is
 * synchronous.
 *
 * Driving `bootstrapMathquestSim()` through these dispatches is a unit test, not a sim run (no
 * `npm run sim*` involved) — see the spec's "Hard constraints".
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import type { WorkerInbound, WorkerOutbound } from "./sim-worker";
import {
  EMPTY_MASTERY_STORE,
  DEFAULT_LOCALE,
  type GameSnapshot,
  type AnswerResponse,
  type ProblemView,
  type CombatAction,
} from "@mathquest/sim-core/sim-bootstrap";
// WARRIOR_MAX_HP/ATTACK_DAMAGE/STARTING_LIFELINES are only re-exported from the package's root
// entry (index.ts), not from the sim-bootstrap subpath above — see @mathquest/sim-core's exports.
import { WARRIOR_MAX_HP, ATTACK_DAMAGE, STARTING_LIFELINES } from "@mathquest/sim-core";

const posted: WorkerOutbound[] = [];
let dispatch: (msg: WorkerInbound) => void;

function lastSnapshot(): GameSnapshot | undefined {
  for (let i = posted.length - 1; i >= 0; i--) {
    const m = posted[i]!;
    if (m.type === "snapshot") return m.snapshot;
  }
  return undefined;
}

beforeAll(async () => {
  vi.useFakeTimers();
  // Mock postMessage BEFORE the handler runs (the module wires self.onmessage at import; the
  // first postMessage happens later, inside a dispatched handler) — matches Citadel's pattern.
  self.postMessage = ((m: WorkerOutbound) => {
    posted.push(m);
  }) as typeof self.postMessage;
  await import("./sim-worker");
  const handler = self.onmessage as unknown as (e: { data: WorkerInbound }) => void;
  dispatch = (msg) => handler({ data: msg });
});

afterAll(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

beforeEach(() => {
  posted.length = 0;
});

function initSim(seed: number): GameSnapshot {
  dispatch({ type: "init", seed, mastery: EMPTY_MASTERY_STORE, locale: DEFAULT_LOCALE });
  return lastSnapshot()!;
}

// --- combat-solving helpers, mirroring @mathquest/sim-core's own sim-bootstrap.test.ts (kept
// local since that file's helpers aren't exported — this file drives the WORKER boundary, not the
// booted sim directly). -------------------------------------------------------------------------

function numbersIn(text: string): number[] {
  return (text.match(/-?\d+/g) ?? []).map(Number);
}

function correctResponseFor(view: ProblemView): AnswerResponse {
  const [x, y] = numbersIn(view.prompt);
  if (view.kind === "typed") {
    const value = view.topic === "addition" ? x! + y! : view.topic === "subtraction" ? x! - y! : x! * y!;
    return { kind: "typed", value };
  }
  const relation = x! < y! ? "<" : x! > y! ? ">" : "=";
  const index = view.choices.indexOf(relation);
  return { kind: "choice", index };
}

function wrongResponse(correct: AnswerResponse): AnswerResponse {
  if (correct.kind === "typed") return { kind: "typed", value: correct.value + 1_000_000 };
  return { kind: "choice", index: (correct.index + 1) % 3 };
}

/** Finds a `"combat"`-type node among the CURRENT `reachableIds` (mirrors sim-core's own
 * `findCombatNodeId`, adapted to a `GameSnapshot` instead of a live `sim`). A `"combat"` node's
 * fight is always against the fixed `Zmeu pui` archetype at grade 1, which is what lets
 * `scriptExactWin` below compute an exact, seed-independent XP total. */
function findCombatNodeId(snap: GameSnapshot): number | undefined {
  const byId = new Map(snap.run.map.nodes.map((n) => [n.id, n]));
  return snap.run.reachableIds.find((id) => byId.get(id)?.type === "combat");
}

/** Scripts an EXACT win against a `"combat"`-type node through the WORKER boundary: `shieldPadding`
 * correct `"shield"` turns (risk-free — SHIELD_BLOCK covers the archetype's max intent) followed by
 * exactly 3 correct `"attack"` turns (24 maxHp / ATTACK_DAMAGE(8) = exactly 3). Total correct
 * solves = `shieldPadding + 3`, each worth 1 xp — mirrors sim-core's own `scriptExactWin`. */
function scriptExactWin(nodeId: number, shieldPadding: number): void {
  dispatch({ type: "choose-node", id: nodeId });
  const act = (action: CombatAction): void => {
    const before = lastSnapshot()!;
    if (before.mode !== "combat") throw new Error("scriptExactWin: fight already over — bad shieldPadding?");
    dispatch({ type: "choose-action", action });
    const pending = lastSnapshot()!;
    if (pending.mode !== "combat") throw new Error("scriptExactWin: unreachable — choose-action alone can't end a fight");
    dispatch({ type: "submit-answer", response: correctResponseFor(pending.combat.problem!) });
  };
  for (let i = 0; i < shieldPadding; i++) act("shield");
  act("attack");
  act("attack");
  act("attack");
}

// --- 1. before "init" -----------------------------------------------------------------------
// MUST run first in this file: `sim` is module-level state with no teardown, so once any later
// test dispatches "init" it stays non-null for the rest of the file (matches the real worker: no
// uninit path exists yet).

describe("sim-worker — before init", () => {
  it("a command sent before 'init' does not throw and produces no snapshot (pins the deliberate silent-drop policy)", () => {
    expect(() => dispatch({ type: "choose-node", id: 0 })).not.toThrow();
    expect(posted.length).toBe(0);

    expect(() => dispatch({ type: "submit-answer", response: { kind: "typed", value: 0 } })).not.toThrow();
    expect(posted.length).toBe(0);
  });

  it("warns once per pre-init command (diagnostic only — does not affect the drop itself)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    dispatch({ type: "choose-action", action: "attack" });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain("choose-action");
    expect(posted.length).toBe(0); // the warning is observational — still no snapshot
    warn.mockRestore();
  });
});

// --- 2. init ---------------------------------------------------------------------------------

describe("sim-worker — init", () => {
  it("posts exactly ready then one snapshot, synchronously, in that order, mode='map'", () => {
    dispatch({ type: "init", seed: 1, mastery: EMPTY_MASTERY_STORE, locale: DEFAULT_LOCALE });
    expect(posted.length).toBe(2);
    expect(posted[0]).toEqual({ type: "ready" });
    const second = posted[1]!;
    expect(second.type).toBe("snapshot");
    if (second.type !== "snapshot") throw new Error("unreachable");
    expect(second.snapshot.mode).toBe("map");
    expect(second.snapshot.run.warriorHp).toBe(WARRIOR_MAX_HP);
    expect(second.snapshot.run.currentId).toBeNull();
    expect(second.snapshot.run.visitedIds).toEqual([]);
    expect([...second.snapshot.run.reachableIds].sort((a, b) => a - b)).toEqual(
      [...second.snapshot.run.map.startIds].sort((a, b) => a - b),
    );
  });

  it("does not call sim.step() as part of init/each command (no idle-time posts either — see below)", () => {
    // step() mutating nothing is sim-core's own invariant (sim-bootstrap.test.ts); what THIS
    // boundary must guarantee is that it never even calls step() itself. Observed indirectly: a
    // fresh init's snapshot is byte-identical however long fake time is advanced afterward with no
    // command dispatched (covered concretely in the "idle" describe block below).
    dispatch({ type: "init", seed: 1, mastery: EMPTY_MASTERY_STORE, locale: DEFAULT_LOCALE });
    const before = lastSnapshot();
    vi.advanceTimersByTime(5_000);
    expect(lastSnapshot()).toEqual(before);
  });
});

// --- 3. idle: zero posts ----------------------------------------------------------------------

describe("sim-worker — idle", () => {
  it("produces exactly zero postMessage calls with no command dispatched, even as fake time advances well past the old 20Hz pump's period", () => {
    initSim(1);
    posted.length = 0; // clear init's ready+snapshot; only idle time follows
    vi.advanceTimersByTime(60_000);
    expect(posted.length).toBe(0);
  });
});

// --- 4. choose-node ----------------------------------------------------------------------------

describe("sim-worker — choose-node", () => {
  it("choosing a reachable combat/elite node starts a fight: mode becomes 'combat' at that node's grade, full warrior HP", () => {
    const snap0 = initSim(1);
    const startId = snap0.run.reachableIds[0]!;
    const node = snap0.run.map.nodes.find((n) => n.id === startId)!;
    expect(["combat", "elite"]).toContain(node.type); // seed 1's row 0 is never "rest" (sim-core's own invariant)

    posted.length = 0;
    dispatch({ type: "choose-node", id: startId });
    expect(posted.length).toBe(1); // exactly one snapshot for this command

    const snap = lastSnapshot()!;
    expect(snap.mode).toBe("combat");
    if (snap.mode !== "combat") throw new Error("unreachable");
    expect(snap.combat.grade).toBe(node.grade);
    expect(snap.combat.warrior.hp).toBe(WARRIOR_MAX_HP);
    expect(snap.run.currentId).toBe(startId);
  });

  it("choosing an id NOT in reachableIds is rejected — the run's own state is unchanged", () => {
    const before = initSim(1);
    const bossId = before.run.map.bossId;
    expect(before.run.reachableIds).not.toContain(bossId); // the boss is never reachable turn 1

    posted.length = 0;
    dispatch({ type: "choose-node", id: bossId });
    expect(posted.length).toBe(1); // the worker still posts (postSnapshot always runs on a real command)
    const after = lastSnapshot()!;
    expect(after.mode).toBe("map");
    expect(after.run.currentId).toBeNull();
    expect(after.run.reachableIds).toEqual(before.run.reachableIds);
  });
});

// --- 5. choose-action / submit-answer / acknowledge-teach --------------------------------------

describe("sim-worker — choose-action / submit-answer / acknowledge-teach", () => {
  it("choose-action opens the answer phase with a real, solvable problem", () => {
    const snap0 = initSim(1);
    dispatch({ type: "choose-node", id: snap0.run.reachableIds[0]! });

    posted.length = 0;
    dispatch({ type: "choose-action", action: "attack" });
    expect(posted.length).toBe(1);

    const snap = lastSnapshot()!;
    if (snap.mode !== "combat") throw new Error("unreachable");
    expect(snap.combat.phase).toBe("await_answer");
    const problem = snap.combat.problem;
    if (problem === null) throw new Error("unreachable — await_answer always carries a problem");
    expect(["typed", "choice"]).toContain(problem.kind);
    expect(numbersIn(problem.prompt).length).toBe(2); // a real two-operand prompt, not a stub
  });

  it("submit-answer (correct) lands the action — damages the enemy, advances the turn, returns to await_action", () => {
    const snap0 = initSim(1);
    dispatch({ type: "choose-node", id: snap0.run.reachableIds[0]! });
    dispatch({ type: "choose-action", action: "attack" });
    const pending = lastSnapshot()!;
    if (pending.mode !== "combat") throw new Error("unreachable");
    const enemyHpBefore = pending.combat.enemy.hp;
    const response = correctResponseFor(pending.combat.problem!);

    posted.length = 0;
    dispatch({ type: "submit-answer", response });
    expect(posted.length).toBe(1);

    const after = lastSnapshot()!;
    if (after.mode !== "combat") throw new Error("unreachable — row-0 archetypes never die to one attack");
    expect(after.combat.lastPlayer).toEqual({ kind: "landed", action: "attack", amount: ATTACK_DAMAGE });
    expect(after.combat.enemy.hp).toBe(enemyHpBefore - ATTACK_DAMAGE);
    expect(after.combat.phase).toBe("await_action"); // non-lethal hit -> straight through the enemy's turn
    expect(after.combat.turn).toBe(2);
  });

  it("submit-answer (incorrect) enters 'teach'; acknowledge-teach clears it and runs the deferred enemy turn", () => {
    const snap0 = initSim(1);
    dispatch({ type: "choose-node", id: snap0.run.reachableIds[0]! });
    dispatch({ type: "choose-action", action: "attack" });
    const pending = lastSnapshot()!;
    if (pending.mode !== "combat") throw new Error("unreachable");
    const wrong = wrongResponse(correctResponseFor(pending.combat.problem!));

    posted.length = 0;
    dispatch({ type: "submit-answer", response: wrong });
    expect(posted.length).toBe(1);
    let snap = lastSnapshot()!;
    if (snap.mode !== "combat") throw new Error("unreachable");
    expect(snap.combat.phase).toBe("teach");
    expect(snap.combat.lastPlayer).toEqual({ kind: "fizzle", action: "attack" });
    expect(typeof snap.combat.teach).toBe("string");
    expect(snap.combat.teach!.length).toBeGreaterThan(0);
    const warriorHpBefore = snap.combat.warrior.hp;

    posted.length = 0;
    dispatch({ type: "acknowledge-teach" });
    expect(posted.length).toBe(1);
    snap = lastSnapshot()!;
    if (snap.mode !== "combat") throw new Error("unreachable — a full-HP warrior survives one hit");
    expect(snap.combat.phase).toBe("await_action");
    expect(snap.combat.teach).toBeNull();
    expect(snap.combat.lastEnemy.kind).toBe("enemy_hit");
    expect(snap.combat.warrior.hp).toBeLessThan(warriorHpBefore); // the deferred enemy hit landed
  });
});

// --- 6. choose-level-up / choose-loot -----------------------------------------------------------

describe("sim-worker — choose-level-up / choose-loot", () => {
  it("an exact 5-XP win queues one level-up; applying it changes run stats/HP and proceeds to loot; taking loot updates inventory", () => {
    const snap0 = initSim(1);
    const nodeId = findCombatNodeId(snap0);
    if (nodeId === undefined) throw new Error("seed 1's reachable ids have no combat node");

    scriptExactWin(nodeId, 2); // 2 shields + 3 attacks = 5 correct solves = 5 xp = xpToNext(1)
    let snap = lastSnapshot()!;
    expect(snap.mode).toBe("level_up");
    expect(snap.run.level).toBe(2);
    expect(snap.run.xp).toBe(0);
    if (snap.mode !== "level_up") throw new Error("unreachable");
    expect(snap.offers.length).toBe(2);
    const before = snap.run;

    posted.length = 0;
    dispatch({ type: "choose-level-up", index: 0 });
    expect(posted.length).toBe(1);
    snap = lastSnapshot()!;
    expect(snap.mode).toBe("loot"); // no more pending level-ups, non-boss win -> loot
    // every UPGRADES entry touches stats, or maxHp/HP (an "hp" pick also heals) — the pick had a
    // real effect, not a no-op that merely advanced the mode.
    const statsChanged = JSON.stringify(snap.run.stats) !== JSON.stringify(before.stats);
    const hpChanged = snap.run.warriorMaxHp !== before.warriorMaxHp;
    expect(statsChanged || hpChanged).toBe(true);

    if (snap.mode !== "loot") throw new Error("unreachable");
    expect(snap.offers.length).toBe(3);
    const item = snap.offers[0]!;

    posted.length = 0;
    dispatch({ type: "choose-loot", index: 0 });
    expect(posted.length).toBe(1);
    const after = lastSnapshot()!;
    expect(after.mode).toBe("map"); // resolved, non-boss win, back to the map
    expect(after.run.inventory).toEqual([item]);
  });
});

// --- 7. use-lifeline -----------------------------------------------------------------------------

describe("sim-worker — use-lifeline", () => {
  it("a hint reveals the worked step and spends exactly one hint charge, leaving fifty/skip untouched", () => {
    const snap0 = initSim(1);
    dispatch({ type: "choose-node", id: snap0.run.reachableIds[0]! });
    dispatch({ type: "choose-action", action: "attack" });
    const before = lastSnapshot()!;
    if (before.mode !== "combat") throw new Error("unreachable");
    expect(before.run.lifelines).toEqual(STARTING_LIFELINES);
    expect(before.combat.hint).toBeNull();

    posted.length = 0;
    dispatch({ type: "use-lifeline", kind: "hint" });
    expect(posted.length).toBe(1);

    const after = lastSnapshot()!;
    if (after.mode !== "combat") throw new Error("unreachable");
    expect(after.run.lifelines).toEqual({ ...STARTING_LIFELINES, hint: STARTING_LIFELINES.hint - 1 });
    expect(typeof after.combat.hint).toBe("string");
    expect(after.combat.hint!.length).toBeGreaterThan(0);
    expect(after.combat.phase).toBe("await_answer"); // a hint never advances the turn
  });
});

// --- 8. new-run --------------------------------------------------------------------------------

describe("sim-worker — new-run", () => {
  it("after a loss, new-run resets HP to full, clears currentId/visitedIds, and regenerates a valid fresh map", () => {
    const snap0 = initSim(1);
    dispatch({ type: "choose-node", id: snap0.run.reachableIds[0]! });

    // Drive to a guaranteed loss: always attack + always answer wrong -> never mitigates, never
    // heals (mirrors sim-core's own driveCombatToLoss, through the worker boundary).
    let guard = 0;
    for (;;) {
      const snap = lastSnapshot()!;
      if (snap.mode !== "combat") break;
      if (guard++ > 300) throw new Error("guard exceeded — seed 1's row-0 fight never ended");
      if (snap.combat.phase === "await_action") dispatch({ type: "choose-action", action: "attack" });
      else if (snap.combat.phase === "await_answer") {
        dispatch({ type: "submit-answer", response: wrongResponse(correctResponseFor(snap.combat.problem!)) });
      } else if (snap.combat.phase === "teach") dispatch({ type: "acknowledge-teach" });
    }
    expect(lastSnapshot()!.mode).toBe("run_lost");

    posted.length = 0;
    dispatch({ type: "new-run" });
    expect(posted.length).toBe(1);

    const after = lastSnapshot()!;
    expect(after.mode).toBe("map");
    expect(after.run.warriorHp).toBe(WARRIOR_MAX_HP);
    expect(after.run.currentId).toBeNull();
    expect(after.run.visitedIds).toEqual([]);
    expect([...after.run.reachableIds].sort((a, b) => a - b)).toEqual(
      [...after.run.map.startIds].sort((a, b) => a - b),
    );
    // A fresh, validly-shaped map (run/map.test.ts owns the full invariant set — spot-check here).
    const nonBoss = after.run.map.nodes.filter((n) => n.type !== "boss");
    expect(nonBoss.length).toBeGreaterThanOrEqual(10);
    expect(nonBoss.length).toBeLessThanOrEqual(14);
  });
});

// --- 9. unknown/malformed message type ----------------------------------------------------------

describe("sim-worker — unknown message type", () => {
  it("an unrecognized message type is handled predictably: no throw, no post, sim state unchanged", () => {
    const before = initSim(1);
    posted.length = 0;

    const malformed = { type: "not-a-real-command" } as unknown as WorkerInbound;
    expect(() => dispatch(malformed)).not.toThrow();
    expect(posted.length).toBe(0);

    // Confirm the drop was total: a real command right after still sees pre-malformed state.
    dispatch({ type: "choose-node", id: before.run.reachableIds[0]! });
    const after = lastSnapshot()!;
    expect(after.mode).toBe("combat");
    expect(after.run.currentId).toBe(before.run.reachableIds[0]!);
  });
});
