/**
 * MateQuest M3 — run-layer tests (corpus/todos/2026-07-22-mathquest-M3-map-and-runs.md, Part A5).
 * The M1/M2 combat-loop tests moved to `combat/combat.test.ts` (adapted to drive `createCombat`
 * directly, per the brief); `run/map.test.ts` covers `generateMap`'s invariants directly. This
 * file covers the RUN state machine `bootstrapMathquestSim` now drives: `chooseNode`/
 * `chooseAction`/`submitAnswer`/`acknowledgeTeach`/`newRun`, HP persistence, and determinism.
 */
import { describe, it, expect } from "vitest";
import { bootstrapMathquestSim, type BootedMathquestSim, type GameSnapshot } from "./sim-bootstrap";
import { REST_HEAL } from "./run/constants";
import { WARRIOR_MAX_HP } from "./combat/constants";
import type { AnswerResponse, ProblemView } from "./combat/types";
import type { RunMap } from "./run/map";

// --- shared helpers (mirror combat/combat.test.ts's — kept local since this file drives the
// RUN's GameSnapshot, not a bare CombatSnapshot) --------------------------------------------

function numbersIn(text: string): number[] {
  return (text.match(/-?\d+/g) ?? []).map(Number);
}

function correctResponseFor(view: ProblemView): AnswerResponse {
  const [x, y] = numbersIn(view.prompt);
  if (view.kind === "typed") {
    const value =
      view.topic === "addition" ? x! + y! : view.topic === "subtraction" ? x! - y! : x! * y!;
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

/** Drives the CURRENT fight to its conclusion (win or lose) with a telegraphed-intent-aware,
 * always-correct strategy: heal when critically low, shield when the CURRENT telegraphed intent
 * is dangerous (mitigates up to `SHIELD_BLOCK`), else attack — the same "read the intent, react"
 * play the design pillar wants a human player to do (corpus/wiki/mathquest-overview.md). Stops
 * as soon as `mode` leaves `"combat"` (the run driver resolves win/loss synchronously — see
 * `sim-bootstrap.ts`'s `resolveCombatIfOver`). */
function driveCombat(sim: BootedMathquestSim, healThreshold = 14): void {
  let guard = 0;
  while (guard++ < 300) {
    const snap = sim.getSnapshot();
    if (snap.mode !== "combat") return;
    const c = snap.combat;
    if (c.phase === "await_action") {
      const hp = c.warrior.hp;
      const intent = c.enemy.intent;
      let action: "attack" | "heal" | "shield";
      if (hp <= healThreshold) action = "heal";
      else if (hp - intent <= 6) action = "shield"; // mitigate a hit that would leave us critical
      else action = "attack";
      sim.chooseAction(action);
    } else if (c.phase === "await_answer") {
      sim.submitAnswer(correctResponseFor(c.problem!));
    } else if (c.phase === "teach") {
      sim.acknowledgeTeach();
    }
  }
}

/** Drives the CURRENT fight toward a GUARANTEED loss: always attack + always answer WRONG, so
 * the enemy never takes damage and the warrior takes every hit unmitigated. */
function driveCombatToLoss(sim: BootedMathquestSim): void {
  let guard = 0;
  while (guard++ < 300) {
    const snap = sim.getSnapshot();
    if (snap.mode !== "combat") return;
    const c = snap.combat;
    if (c.phase === "await_action") sim.chooseAction("attack");
    else if (c.phase === "await_answer") sim.submitAnswer(wrongResponse(correctResponseFor(c.problem!)));
    else if (c.phase === "teach") sim.acknowledgeTeach();
  }
}

/** BFS shortest path (as node ids, start-id-first, `targetId`-last) from ANY start id to
 * `targetId`, following `MapNode.next` — the map is a connected DAG (`run/map.test.ts`), so a
 * path always exists. */
function pathTo(map: RunMap, targetId: number): number[] {
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const parent = new Map<number, number | null>();
  const queue: number[] = [];
  for (const s of map.startIds) {
    parent.set(s, null);
    queue.push(s);
  }
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (id === targetId) break;
    for (const next of byId.get(id)!.next) {
      if (!parent.has(next)) {
        parent.set(next, id);
        queue.push(next);
      }
    }
  }
  if (!parent.has(targetId)) throw new Error(`pathTo: node ${targetId} is unreachable`);
  const path: number[] = [];
  let cur: number | null = targetId;
  while (cur !== null) {
    path.unshift(cur);
    cur = parent.get(cur) ?? null;
  }
  return path;
}

/** Walks `sim` along the shortest path to `targetId`, winning every intervening fight (heal-
 * priority strategy) and resolving every rest node. Returns `"lost"` the instant any fight along
 * the way ends the run; `"reached"` once `targetId` itself has been chosen and resolved. */
function walkTo(sim: BootedMathquestSim, targetId: number): "reached" | "lost" {
  const snap0 = sim.getSnapshot();
  if (snap0.mode !== "map") throw new Error("walkTo: sim must be in map mode");
  const path = pathTo(snap0.run.map, targetId);
  for (const id of path) {
    sim.chooseNode(id);
    if (sim.getSnapshot().mode === "combat") driveCombat(sim);
    if (sim.getSnapshot().mode === "run_lost") return "lost";
  }
  return "reached";
}

describe("bootstrapMathquestSim — run bootstrap (M3)", () => {
  it("starts in map mode with a full-HP warrior, no current node, reachable = the map's startIds", () => {
    const sim = bootstrapMathquestSim({ seed: 1 });
    const snap = sim.getSnapshot();
    expect(snap.mode).toBe("map");
    expect(snap.run.warriorHp).toBe(WARRIOR_MAX_HP);
    expect(snap.run.warriorMaxHp).toBe(WARRIOR_MAX_HP);
    expect(snap.run.currentId).toBeNull();
    expect(snap.run.visitedIds).toEqual([]);
    expect([...snap.run.reachableIds].sort((a, b) => a - b)).toEqual(
      [...snap.run.map.startIds].sort((a, b) => a - b),
    );
  });

  it("world and scheduler are freshly constructed per bootstrap call (no shared state leaks)", () => {
    const a = bootstrapMathquestSim({ seed: 1 });
    const b = bootstrapMathquestSim({ seed: 1 });
    expect(a.world).not.toBe(b.world);
    expect(a.scheduler).not.toBe(b.scheduler);
  });

  it("step() never mutates run/combat state (event-driven only)", () => {
    const sim = bootstrapMathquestSim({ seed: 1 });
    sim.chooseNode(sim.getSnapshot().run.reachableIds[0]!);
    const before = sim.getSnapshot();
    for (let i = 0; i < 50; i++) sim.step();
    expect(sim.getSnapshot()).toEqual(before);
  });
});

describe("bootstrapMathquestSim — chooseNode", () => {
  it("choosing a reachable combat/elite node starts a fight (mode='combat') with that node's grade + archetype", () => {
    const sim = bootstrapMathquestSim({ seed: 1 });
    const snap = sim.getSnapshot();
    const startId = snap.run.reachableIds[0]!;
    const node = snap.run.map.nodes.find((n) => n.id === startId)!;
    expect(["combat", "elite"]).toContain(node.type); // row 0 is never "rest"

    sim.chooseNode(startId);
    const after = sim.getSnapshot();
    expect(after.mode).toBe("combat");
    if (after.mode !== "combat") throw new Error("unreachable");
    expect(after.combat.grade).toBe(node.grade);
    expect(after.combat.warrior.hp).toBe(WARRIOR_MAX_HP); // fresh run, full HP going in
    expect(after.run.currentId).toBe(startId);
  });

  it("choosing an id NOT in reachableIds is rejected — no state change", () => {
    const sim = bootstrapMathquestSim({ seed: 1 });
    const before = sim.getSnapshot();
    const bossId = before.run.map.bossId;
    expect(before.run.reachableIds).not.toContain(bossId); // the boss is never reachable turn 1
    sim.chooseNode(bossId);
    expect(sim.getSnapshot()).toEqual(before);
  });

  it("chooseAction/submitAnswer/acknowledgeTeach are ignored while mode is 'map'", () => {
    const sim = bootstrapMathquestSim({ seed: 1 });
    const before = sim.getSnapshot();
    sim.chooseAction("attack");
    sim.submitAnswer({ kind: "typed", value: 0 });
    sim.acknowledgeTeach();
    expect(sim.getSnapshot()).toEqual(before);
  });

  it("a rest node heals +REST_HEAL (capped at warriorMaxHp) and returns to 'map' with reachableIds = its next — no fight", () => {
    // Search for a seed+path that reaches a rest node without dying en route (any intervening
    // fights are won via `driveCombat`'s heal-priority strategy); capture HP immediately before
    // the rest resolves so the heal amount is checked precisely.
    for (let seed = 1; seed <= 50; seed++) {
      const sim = bootstrapMathquestSim({ seed });
      const map = sim.getSnapshot().run.map;
      const rest = map.nodes.find((n) => n.type === "rest");
      if (rest === undefined) continue;
      const path = pathTo(map, rest.id);
      let lost = false;
      for (const id of path.slice(0, -1)) {
        sim.chooseNode(id);
        if (sim.getSnapshot().mode === "combat") driveCombat(sim);
        if (sim.getSnapshot().mode === "run_lost") {
          lost = true;
          break;
        }
      }
      if (lost) continue;
      const hpBefore = sim.getSnapshot().run.warriorHp;
      sim.chooseNode(rest.id);
      const after = sim.getSnapshot();
      expect(after.mode).toBe("map");
      expect(after.run.warriorHp).toBe(Math.min(WARRIOR_MAX_HP, hpBefore + REST_HEAL));
      expect(after.run.visitedIds).toContain(rest.id);
      expect([...after.run.reachableIds].sort((a, b) => a - b)).toEqual([...rest.next].sort((a, b) => a - b));
      return; // found one — done
    }
    throw new Error("no seed reached a rest node without dying in 50 tries");
  });
});

describe("bootstrapMathquestSim — winning persists HP onto the map", () => {
  it("winning a fight returns to 'map' with warriorHp reduced by the damage taken, and reachableIds = the node's next", () => {
    // Row 0 is never "rest"; find a seed whose FIRST start node is plain "combat" (guaranteed
    // safe to win via always-attack from full HP: combat archetype's max 2 return hits, 8 each,
    // never exceeds 30 — see run/enemies.ts).
    let sim: BootedMathquestSim | undefined;
    let startId = -1;
    let startNext: readonly number[] = [];
    for (let seed = 1; seed <= 50; seed++) {
      const candidate = bootstrapMathquestSim({ seed });
      const snap = candidate.getSnapshot();
      const id = snap.run.reachableIds[0]!;
      const node = snap.run.map.nodes.find((n) => n.id === id)!;
      if (node.type === "combat") {
        sim = candidate;
        startId = id;
        startNext = node.next;
        break;
      }
    }
    if (sim === undefined) throw new Error("no seed's start node was plain combat in 50 tries");

    sim.chooseNode(startId);
    driveCombat(sim); // always-attack-when-safe strategy — see driveCombat

    const after = sim.getSnapshot();
    expect(after.mode).toBe("map");
    expect(after.run.warriorHp).toBeLessThan(WARRIOR_MAX_HP); // the fight cost SOME HP
    expect(after.run.warriorHp).toBeGreaterThan(0);
    expect(after.run.visitedIds).toEqual([startId]);
    expect([...after.run.reachableIds].sort((a, b) => a - b)).toEqual([...startNext].sort((a, b) => a - b));

    // The NEXT fight starts with the PERSISTED (lower) HP, not a fresh full bar.
    const nextId = after.run.reachableIds[0]!;
    sim.chooseNode(nextId);
    const combatSnap = sim.getSnapshot();
    expect(combatSnap.mode).toBe("combat");
    if (combatSnap.mode !== "combat") throw new Error("unreachable");
    expect(combatSnap.combat.warrior.hp).toBe(after.run.warriorHp);
  });
});

describe("bootstrapMathquestSim — losing a fight ends the run", () => {
  it("a fight lost (always wrong, always attacked back) sets mode='run_lost'", () => {
    const sim = bootstrapMathquestSim({ seed: 1 });
    const startId = sim.getSnapshot().run.reachableIds[0]!;
    sim.chooseNode(startId);
    expect(sim.getSnapshot().mode).toBe("combat");
    driveCombatToLoss(sim);
    const after = sim.getSnapshot();
    expect(after.mode).toBe("run_lost");
    expect(after.run.warriorHp).toBe(0);
  });

  it("chooseNode/chooseAction/submitAnswer/acknowledgeTeach are all ignored once run_lost", () => {
    const sim = bootstrapMathquestSim({ seed: 1 });
    sim.chooseNode(sim.getSnapshot().run.reachableIds[0]!);
    driveCombatToLoss(sim);
    const before = sim.getSnapshot();
    expect(before.mode).toBe("run_lost");
    sim.chooseNode(before.run.map.startIds[0]!);
    sim.chooseAction("attack");
    sim.submitAnswer({ kind: "typed", value: 0 });
    sim.acknowledgeTeach();
    expect(sim.getSnapshot()).toEqual(before);
  });
});

describe("bootstrapMathquestSim — the hard branch is actually harder", () => {
  it("an elite node's fight uses the elite archetype at a higher grade than its row's plain combat sibling", () => {
    // Search for a seed whose branching row IS row 0 (the elite sits at a start id, so we can
    // choose it directly without first winning our way there).
    let sim: BootedMathquestSim | undefined;
    let eliteId = -1;
    let siblingGrade = -1;
    for (let seed = 1; seed <= 200; seed++) {
      const candidate = bootstrapMathquestSim({ seed });
      const map = candidate.getSnapshot().run.map;
      const row0 = map.nodes.filter((n) => n.row === 0);
      const elite = row0.find((n) => n.type === "elite");
      const combatSibling = row0.find((n) => n.type === "combat");
      if (elite !== undefined && combatSibling !== undefined) {
        sim = candidate;
        eliteId = elite.id;
        siblingGrade = combatSibling.grade;
        break;
      }
    }
    if (sim === undefined) throw new Error("no seed's row 0 branched into an elite in 200 tries");

    sim.chooseNode(eliteId);
    const snap = sim.getSnapshot();
    expect(snap.mode).toBe("combat");
    if (snap.mode !== "combat") throw new Error("unreachable");
    expect(snap.combat.enemy.name).toBe("Balaur");
    expect(snap.combat.enemy.maxHp).toBe(26);
    expect(snap.combat.grade).toBeGreaterThan(siblingGrade);
  });
});

describe("bootstrapMathquestSim — beating the boss wins the run", () => {
  it("walking to and winning the boss fight sets mode='run_won'", () => {
    let sim: BootedMathquestSim | undefined;
    for (let seed = 1; seed <= 300; seed++) {
      const candidate = bootstrapMathquestSim({ seed });
      const bossId = candidate.getSnapshot().run.map.bossId;
      if (walkTo(candidate, bossId) === "reached" && candidate.getSnapshot().mode === "run_won") {
        sim = candidate;
        break;
      }
    }
    if (sim === undefined) throw new Error("no seed reached+beat the boss in 300 tries");
    const snap = sim.getSnapshot();
    expect(snap.mode).toBe("run_won");
    expect(snap.run.warriorHp).toBeGreaterThan(0);
  });
});

describe("bootstrapMathquestSim — newRun", () => {
  it("is ignored while mode is 'map' or 'combat'", () => {
    const sim = bootstrapMathquestSim({ seed: 1 });
    const before = sim.getSnapshot();
    sim.newRun();
    expect(sim.getSnapshot()).toEqual(before);

    sim.chooseNode(before.run.reachableIds[0]!);
    const inCombat = sim.getSnapshot();
    expect(inCombat.mode).toBe("combat");
    sim.newRun();
    expect(sim.getSnapshot()).toEqual(inCombat);
  });

  it("after a loss, newRun() resets warriorHp to full and generates a fresh map, back in 'map' mode", () => {
    const sim = bootstrapMathquestSim({ seed: 1 });
    sim.chooseNode(sim.getSnapshot().run.reachableIds[0]!);
    driveCombatToLoss(sim);
    expect(sim.getSnapshot().mode).toBe("run_lost");

    sim.newRun();
    const after = sim.getSnapshot();
    expect(after.mode).toBe("map");
    expect(after.run.warriorHp).toBe(WARRIOR_MAX_HP);
    expect(after.run.visitedIds).toEqual([]);
    expect(after.run.currentId).toBeNull();
    expect([...after.run.reachableIds].sort((a, b) => a - b)).toEqual(
      [...after.run.map.startIds].sort((a, b) => a - b),
    );
    // A fresh, validly-shaped map (run/map.test.ts covers the full invariant set — spot-check here).
    const nonBoss = after.run.map.nodes.filter((n) => n.type !== "boss");
    expect(nonBoss.length).toBeGreaterThanOrEqual(10);
    expect(nonBoss.length).toBeLessThanOrEqual(14);
  });

  it("two successive newRuns produce two DIFFERENT maps (distinct `run:${n}` forks)", () => {
    const sim = bootstrapMathquestSim({ seed: 1 });
    sim.chooseNode(sim.getSnapshot().run.reachableIds[0]!);
    driveCombatToLoss(sim);
    sim.newRun();
    const map1 = sim.getSnapshot().run.map;

    sim.chooseNode(sim.getSnapshot().run.reachableIds[0]!);
    driveCombatToLoss(sim);
    sim.newRun();
    const map2 = sim.getSnapshot().run.map;

    expect(map1).not.toEqual(map2);
  });
});

describe("bootstrapMathquestSim — determinism", () => {
  it("the SAME seed + the SAME command script -> an IDENTICAL GameSnapshot sequence", () => {
    const seed = 777;

    function run(): GameSnapshot[] {
      const sim = bootstrapMathquestSim({ seed });
      const snapshots: GameSnapshot[] = [sim.getSnapshot()];
      for (let fight = 0; fight < 4; fight++) {
        const snap = sim.getSnapshot();
        if (snap.mode !== "map") break;
        sim.chooseNode(snap.run.reachableIds[0]!);
        snapshots.push(sim.getSnapshot());
        let guard = 0;
        while (sim.getSnapshot().mode === "combat" && guard++ < 300) {
          const combatSnap = sim.getSnapshot();
          if (combatSnap.mode !== "combat") break;
          if (combatSnap.combat.phase === "await_action") {
            sim.chooseAction(combatSnap.combat.warrior.hp <= 15 ? "heal" : "attack");
          } else if (combatSnap.combat.phase === "await_answer") {
            sim.submitAnswer(correctResponseFor(combatSnap.combat.problem!));
          } else if (combatSnap.combat.phase === "teach") {
            sim.acknowledgeTeach();
          }
          snapshots.push(sim.getSnapshot());
        }
        if (sim.getSnapshot().mode === "run_won" || sim.getSnapshot().mode === "run_lost") break;
      }
      return snapshots;
    }

    const a = run();
    const b = run();
    expect(a.length).toBeGreaterThan(1);
    expect(a).toEqual(b);
  });

  it("determinism holds across a rest node + newRun too", () => {
    function run(): GameSnapshot[] {
      const sim = bootstrapMathquestSim({ seed: 2 });
      const snapshots: GameSnapshot[] = [sim.getSnapshot()];
      sim.chooseNode(sim.getSnapshot().run.reachableIds[0]!);
      driveCombatToLoss(sim);
      snapshots.push(sim.getSnapshot());
      sim.newRun();
      snapshots.push(sim.getSnapshot());
      sim.chooseNode(sim.getSnapshot().run.reachableIds[0]!);
      snapshots.push(sim.getSnapshot());
      return snapshots;
    }
    expect(run()).toEqual(run());
  });
});
