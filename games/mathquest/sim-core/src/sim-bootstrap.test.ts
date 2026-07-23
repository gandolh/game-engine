/**
 * MateQuest M3 — run-layer tests (corpus/todos/2026-07-22-mathquest-M3-map-and-runs.md, Part A5).
 * The M1/M2 combat-loop tests moved to `combat/combat.test.ts` (adapted to drive `createCombat`
 * directly, per the brief); `run/map.test.ts` covers `generateMap`'s invariants directly. This
 * file covers the RUN state machine `bootstrapMathquestSim` now drives: `chooseNode`/
 * `chooseAction`/`submitAnswer`/`acknowledgeTeach`/`newRun`, HP persistence, and determinism.
 *
 * M4a (corpus/todos/2026-07-23-mathquest-M4a-progression-loot.md) adds the "XP + level" / "Level-
 * up applies" / "Loot" / "Flow" / "Determinism guard" describe blocks at the bottom of this file —
 * see each block's own doc for how it scripts a deterministic win (`run/progression.ts`'s
 * `xpForSolve`/`xpToNext` and `combat/constants.ts`'s fixed numbers compose into an exact,
 * seed-independent XP total for a `"combat"`-type node).
 */
import { describe, it, expect } from "vitest";
import { bootstrapMathquestSim, type BootedMathquestSim, type GameSnapshot, type RunMode } from "./sim-bootstrap";
import { REST_HEAL } from "./run/constants";
import { ATTACK_DAMAGE, WARRIOR_MAX_HP } from "./combat/constants";
import { ENEMY_ARCHETYPES } from "./run/enemies";
import { xpToNext, ZERO_STATS } from "./run/progression";
import { foldItemBonus } from "./run/loot";
import { STARTING_LIFELINES } from "./run/lifelines";
import {
  BLUEPRINTS,
  ELITE_UNLOCK_TIER,
  EMPTY_MASTERY_STORE,
  overallMasteryTier,
  type MasteryStore,
} from "./run/mastery";
import type { AnswerResponse, ProblemView } from "./combat/types";
import type { RunMap } from "./run/map";

// --- M4c helpers (corpus/todos/2026-07-23-mathquest-M4c-persistent-mastery.md) -----------------

/** A store whose overall tier sum meets `ELITE_UNLOCK_TIER` — used by tests that need the elite
 * gate OPEN (e.g. the pre-M4c "hard branch" test, which used to find an elite for FREE with a
 * fresh/empty store; post-M4c a fresh store has overall 0 < ELITE_UNLOCK_TIER, so NO seed's map
 * has an elite anymore unless a high-enough mastery store is passed in). One topic at tier 2 (15
 * correct) sums to exactly `ELITE_UNLOCK_TIER` (2). */
function highMasteryStore(): MasteryStore {
  return {
    version: 1,
    topics: {
      addition: { correct: 15, attempts: 15 },
      subtraction: { correct: 0, attempts: 0 },
      multiplication: { correct: 0, attempts: 0 },
      comparison: { correct: 0, attempts: 0 },
    },
    blueprints: [],
  };
}

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

/** Drains the M4a post-win detour (`"level_up"` then `"loot"`) until `mode` leaves both — a
 * no-op if neither applies. Skips loot (`-1`) and, on a level-up, picks the first offer that is
 * NOT `"hp"` (falling back to index 0 if every offer happens to be `"hp"` — never happens today,
 * since `offerUpgrades`'s distinct-kinds guarantee means at most one of 2 offers can be `"hp"`) —
 * an `"hp"` pick also HEALS the warrior (by design, M4a), which would push `warriorHp` back above
 * the pre-M4a fixed `WARRIOR_MAX_HP` some of these callers assert against. So this keeps the
 * pre-M4a run-flow invariants (HP persistence, reachability, boss win, …) intact: the run lands
 * back in `"map"`/`"run_won"` exactly like before M4a, just with a couple of extra ticks in
 * between. Progression's OWN behavior (offer application, loot pickup, the `"hp"` heal) is
 * covered by `run/progression.test.ts`/`run/loot.test.ts`, not here. */
function resolvePostCombat(sim: BootedMathquestSim): void {
  let guard = 0;
  while (guard++ < 20) {
    const snap = sim.getSnapshot();
    if (snap.mode === "level_up") {
      const nonHp = snap.offers.findIndex((o) => o.kind !== "hp");
      sim.chooseLevelUp(nonHp === -1 ? 0 : nonHp);
    } else if (snap.mode === "loot") {
      sim.chooseLoot(-1);
    } else {
      return;
    }
  }
  throw new Error("resolvePostCombat: stuck in level_up/loot after 20 iterations");
}

/** Drives the CURRENT fight to its conclusion (win or lose) with a telegraphed-intent-aware,
 * always-correct strategy: heal when critically low, shield when the CURRENT telegraphed intent
 * is dangerous (mitigates up to `SHIELD_BLOCK`), else attack — the same "read the intent, react"
 * play the design pillar wants a human player to do (corpus/wiki/mathquest-overview.md). Stops
 * as soon as `mode` leaves `"combat"` (the run driver resolves win/loss synchronously — see
 * `sim-bootstrap.ts`'s `resolveCombatIfOver`) — a WIN additionally drains the M4a `"level_up"`/
 * `"loot"` detour (`resolvePostCombat`) before returning, so callers see the same `"map"`/
 * `"run_won"` landing they did pre-M4a. */
function driveCombat(sim: BootedMathquestSim, healThreshold = 14): void {
  let guard = 0;
  while (guard++ < 300) {
    const snap = sim.getSnapshot();
    if (snap.mode !== "combat") {
      resolvePostCombat(sim);
      return;
    }
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

// --- M4a helpers (progression/loot flow tests below) -----------------------------------------

/** Finds a `"combat"`-type node among the CURRENT `reachableIds` — a `"combat"` node's fight is
 * ALWAYS against the fixed `Zmeu pui` archetype (`run/enemies.ts`'s `ENEMY_ARCHETYPES.combat` —
 * maxHp 24, intent 5-8) at grade 1, regardless of seed, which is what lets `scriptExactWin` below
 * compute an EXACT, seed-independent XP total. */
function findCombatNodeId(sim: BootedMathquestSim): number | undefined {
  const snap = sim.getSnapshot();
  const byId = new Map(snap.run.map.nodes.map((n) => [n.id, n]));
  return snap.run.reachableIds.find((id) => byId.get(id)?.type === "combat");
}

/** Scripts an EXACT win against a `"combat"`-type node: `shieldPadding` correct `"shield"` turns
 * (each fully self-mitigating — `SHIELD_BLOCK` (8) covers the archetype's max intent (8), so
 * padding is risk-free) followed by exactly 3 correct `"attack"` turns (`ENEMY_ARCHETYPES.combat`'s
 * 24 maxHp / `ATTACK_DAMAGE` (8) = exactly 3 — the 3rd is always lethal, ending the fight with no
 * further enemy turn). Total correct solves = `shieldPadding + 3`, each worth `xpForSolve(1) = 1`
 * xp — an exact, seed-independent XP total (only the 2 NON-killing attacks ever take an unblocked
 * hit, worst case `2 * 8 = 16` damage, safely under `WARRIOR_MAX_HP` (30) even from full health).
 * Must be called with `sim` in `"map"` mode and `nodeId` a currently-reachable `"combat"` node
 * (see `findCombatNodeId`). Leaves `sim` wherever `resolveCombatIfOver`'s M4a `proceed()` landed
 * (`"level_up"` if any threshold was crossed, else `"loot"`). */
function scriptExactWin(sim: BootedMathquestSim, nodeId: number, shieldPadding: number): void {
  sim.chooseNode(nodeId);
  const act = (action: "attack" | "shield"): void => {
    const before = sim.getSnapshot();
    if (before.mode !== "combat") throw new Error("scriptExactWin: fight already over — bad shieldPadding?");
    sim.chooseAction(action);
    const pending = sim.getSnapshot();
    if (pending.mode !== "combat") throw new Error("scriptExactWin: unreachable — chooseAction alone can't end a fight");
    sim.submitAnswer(correctResponseFor(pending.combat.problem!));
  };
  for (let i = 0; i < shieldPadding; i++) act("shield");
  act("attack");
  act("attack");
  act("attack");
}

/** Drives the CURRENT fight to its conclusion like `driveCombat`, but WITHOUT auto-draining
 * `"loot"` — it only drains `"level_up"` (a fight can't finish resolving otherwise) — and returns
 * every `mode` observed along the way, so a caller can assert `"loot"` never appeared (the boss
 * win's "no loot" invariant). Uses the same always-correct, heal-priority strategy as
 * `driveCombat`. */
function driveFightCapturingModes(sim: BootedMathquestSim): RunMode[] {
  const seen: RunMode[] = [];
  let guard = 0;
  while (guard++ < 300) {
    const snap = sim.getSnapshot();
    seen.push(snap.mode);
    if (snap.mode === "combat") {
      const c = snap.combat;
      if (c.phase === "await_action") {
        sim.chooseAction(c.warrior.hp <= 14 ? "heal" : "attack");
      } else if (c.phase === "await_answer") {
        sim.submitAnswer(correctResponseFor(c.problem!));
      } else if (c.phase === "teach") {
        sim.acknowledgeTeach();
      }
    } else if (snap.mode === "level_up") {
      sim.chooseLevelUp(0);
    } else {
      return seen; // "loot" / "run_won" / "run_lost" / "map" — done; caller inspects `seen`
    }
  }
  throw new Error("driveFightCapturingModes: guard exceeded");
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
    // M4c: a fresh/empty mastery store now GATES the elite off (overall 0 < ELITE_UNLOCK_TIER) —
    // pass a high-mastery store so the elite gate is open, matching this test's pre-M4c intent
    // (finding SOME seed with an elite reachable at row 0) rather than the new empty-store default.
    // Search for a seed whose branching row IS row 0 (the elite sits at a start id, so we can
    // choose it directly without first winning our way there).
    let sim: BootedMathquestSim | undefined;
    let eliteId = -1;
    let siblingGrade = -1;
    for (let seed = 1; seed <= 200; seed++) {
      const candidate = bootstrapMathquestSim({ seed, mastery: highMasteryStore() });
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

// =================================================================================================
// M4a — in-run progression + loot (corpus/todos/2026-07-23-mathquest-M4a-progression-loot.md)
// =================================================================================================

describe("bootstrapMathquestSim — M4a XP + level", () => {
  it("N correct solves at grade 1 accrue exactly N xp; crossing 5 queues exactly 1 level-up", () => {
    const sim = bootstrapMathquestSim({ seed: 1 });
    const nodeId = findCombatNodeId(sim);
    if (nodeId === undefined) throw new Error("seed 1's reachable ids have no combat node");
    scriptExactWin(sim, nodeId, 2); // 2 shields + 3 attacks = 5 correct solves = 5 xp
    const snap = sim.getSnapshot();
    expect(snap.mode).toBe("level_up");
    expect(snap.run.level).toBe(2);
    expect(snap.run.xp).toBe(0); // 5 - xpToNext(1)=5 -> exactly consumed
    expect(snap.run.xpToNext).toBe(xpToNext(2));
    if (snap.mode !== "level_up") throw new Error("unreachable");
    expect(snap.offers.length).toBe(2);
    expect(new Set(snap.offers.map((o) => o.kind)).size).toBe(2); // distinct kinds
  });

  it("a big enough win crosses MULTIPLE thresholds in one fight, queuing that many level-ups", () => {
    const sim = bootstrapMathquestSim({ seed: 1 });
    const nodeId = findCombatNodeId(sim);
    if (nodeId === undefined) throw new Error("seed 1's reachable ids have no combat node");
    scriptExactWin(sim, nodeId, 12); // 12 shields + 3 attacks = 15 correct solves = 15 xp
    // 15 -> (-5) level2, 10 left -> (-10) level3, 0 left. Two thresholds crossed in ONE fight.
    let snap = sim.getSnapshot();
    expect(snap.mode).toBe("level_up");
    expect(snap.run.level).toBe(3);
    expect(snap.run.xp).toBe(0);
    expect(snap.run.xpToNext).toBe(xpToNext(3));

    sim.chooseLevelUp(0); // resolves the 1st of the 2 pending level-ups
    snap = sim.getSnapshot();
    expect(snap.mode).toBe("level_up"); // the 2nd is still due — proceed() doesn't skip ahead

    sim.chooseLevelUp(0); // resolves the 2nd
    snap = sim.getSnapshot();
    expect(snap.mode).toBe("loot"); // NOW (and only now) it proceeds to loot (non-boss win)
  });
});

describe("bootstrapMathquestSim — M4a level-up applies", () => {
  it("choosing 'atk' raises the NEXT fight's attack damage (ATTACK_DAMAGE + 2, not the baseline)", () => {
    let found = false;
    for (let seed = 1; seed <= 60 && !found; seed++) {
      const sim = bootstrapMathquestSim({ seed });
      const nodeId = findCombatNodeId(sim);
      if (nodeId === undefined) continue;
      scriptExactWin(sim, nodeId, 2);
      const levelUpSnap = sim.getSnapshot();
      if (levelUpSnap.mode !== "level_up") continue;
      const atkIndex = levelUpSnap.offers.findIndex((o) => o.kind === "atk");
      if (atkIndex === -1) continue; // this seed's offers didn't include atk — try another

      sim.chooseLevelUp(atkIndex);
      expect(sim.getSnapshot().mode).toBe("loot");
      sim.chooseLoot(-1);
      expect(sim.getSnapshot().mode).toBe("map");

      const nextId = findCombatNodeId(sim);
      if (nextId === undefined) continue; // no combat node reachable next — try another seed
      sim.chooseNode(nextId);
      const combatSnap = sim.getSnapshot();
      if (combatSnap.mode !== "combat") continue;
      const enemyHpBefore = combatSnap.combat.enemy.hp;
      sim.chooseAction("attack");
      const pending = sim.getSnapshot();
      if (pending.mode !== "combat") continue;
      sim.submitAnswer(correctResponseFor(pending.combat.problem!));
      const afterAnswer = sim.getSnapshot();
      if (afterAnswer.mode !== "combat") continue; // (never happens: 24 maxHp > ATTACK_DAMAGE+2)

      // ENEMY_ARCHETYPES.combat's 24 maxHp is untouched by mods — only the DAMAGE per attack is.
      expect(ENEMY_ARCHETYPES.combat.maxHp).toBe(24);
      expect(enemyHpBefore - afterAnswer.combat.enemy.hp).toBe(ATTACK_DAMAGE + 2);
      found = true;
    }
    expect(found).toBe(true);
  });

  it("choosing 'hp' raises maxHp by 6 AND heals the warrior by the same amount (capped at the new max)", () => {
    let found = false;
    for (let seed = 1; seed <= 60 && !found; seed++) {
      const sim = bootstrapMathquestSim({ seed });
      const nodeId = findCombatNodeId(sim);
      if (nodeId === undefined) continue;
      scriptExactWin(sim, nodeId, 2);
      const levelUpSnap = sim.getSnapshot();
      if (levelUpSnap.mode !== "level_up") continue;
      const hpIndex = levelUpSnap.offers.findIndex((o) => o.kind === "hp");
      if (hpIndex === -1) continue; // this seed's offers didn't include hp — try another

      const before = levelUpSnap.run;
      sim.chooseLevelUp(hpIndex);
      const after = sim.getSnapshot().run;
      expect(after.warriorMaxHp).toBe(before.warriorMaxHp + 6);
      expect(after.warriorHp).toBe(Math.min(after.warriorMaxHp, before.warriorHp + 6));
      expect(after.stats.maxHp).toBe(before.stats.maxHp + 6);
      found = true;
    }
    expect(found).toBe(true);
  });
});

describe("bootstrapMathquestSim — M4a loot", () => {
  it("a win below the first XP threshold skips level_up, offers 3 distinct items, and taking one folds its bonus into stats (healing if it's a maxHp bonus)", () => {
    const sim = bootstrapMathquestSim({ seed: 1 });
    const nodeId = findCombatNodeId(sim);
    if (nodeId === undefined) throw new Error("seed 1's reachable ids have no combat node");
    scriptExactWin(sim, nodeId, 0); // 3 correct solves = 3 xp < xpToNext(1)=5 -> straight to loot
    const lootSnap = sim.getSnapshot();
    expect(lootSnap.mode).toBe("loot");
    if (lootSnap.mode !== "loot") throw new Error("unreachable");
    expect(lootSnap.offers.length).toBe(3);
    expect(new Set(lootSnap.offers.map((o) => o.id)).size).toBe(3); // distinct

    const item = lootSnap.offers[0]!;
    const before = lootSnap.run;
    sim.chooseLoot(0);
    const after = sim.getSnapshot();
    expect(after.mode).toBe("map"); // no pending level-ups, non-boss win, loot now resolved
    expect(after.run.stats).toEqual(foldItemBonus(ZERO_STATS, item.bonus));
    expect(after.run.inventory).toEqual([item]);
    const maxHpBonus = item.bonus.maxHp ?? 0;
    expect(after.run.warriorMaxHp).toBe(before.warriorMaxHp + maxHpBonus);
    expect(after.run.warriorHp).toBe(Math.min(after.run.warriorMaxHp, before.warriorHp + maxHpBonus));
  });

  it("skipping loot (-1) changes nothing but still advances the mode", () => {
    const sim = bootstrapMathquestSim({ seed: 1 });
    const nodeId = findCombatNodeId(sim);
    if (nodeId === undefined) throw new Error("seed 1's reachable ids have no combat node");
    scriptExactWin(sim, nodeId, 0);
    const before = sim.getSnapshot();
    expect(before.mode).toBe("loot");
    sim.chooseLoot(-1);
    const after = sim.getSnapshot();
    expect(after.mode).toBe("map");
    expect(after.run.stats).toEqual(ZERO_STATS);
    expect(after.run.inventory).toEqual([]);
    expect(after.run.warriorHp).toBe(before.run.warriorHp); // no heal from skipping
  });
});

describe("bootstrapMathquestSim — M4a flow order", () => {
  it("a win that crosses exactly one threshold visits level_up THEN loot THEN map, in that order", () => {
    const sim = bootstrapMathquestSim({ seed: 1 });
    const nodeId = findCombatNodeId(sim);
    if (nodeId === undefined) throw new Error("seed 1's reachable ids have no combat node");
    scriptExactWin(sim, nodeId, 2);
    expect(sim.getSnapshot().mode).toBe("level_up");
    sim.chooseLevelUp(0);
    expect(sim.getSnapshot().mode).toBe("loot");
    sim.chooseLoot(-1);
    expect(sim.getSnapshot().mode).toBe("map");
  });

  it("a win below the first threshold skips level_up entirely, straight to loot", () => {
    const sim = bootstrapMathquestSim({ seed: 1 });
    const nodeId = findCombatNodeId(sim);
    if (nodeId === undefined) throw new Error("seed 1's reachable ids have no combat node");
    scriptExactWin(sim, nodeId, 0);
    expect(sim.getSnapshot().mode).toBe("loot");
  });

  it("beating the boss goes straight to run_won, never visiting 'loot'", () => {
    let sim: BootedMathquestSim | undefined;
    let bossId = -1;
    for (let seed = 1; seed <= 300 && sim === undefined; seed++) {
      const candidate = bootstrapMathquestSim({ seed });
      bossId = candidate.getSnapshot().run.map.bossId;
      const path = pathTo(candidate.getSnapshot().run.map, bossId);
      let lost = false;
      for (const id of path.slice(0, -1)) {
        candidate.chooseNode(id);
        if (candidate.getSnapshot().mode === "combat") driveCombat(candidate);
        if (candidate.getSnapshot().mode === "run_lost") {
          lost = true;
          break;
        }
      }
      if (lost || candidate.getSnapshot().mode !== "map") continue;
      sim = candidate;
    }
    if (sim === undefined) throw new Error("no seed reached the boss's doorstep in 300 tries");

    sim.chooseNode(bossId);
    const modes = driveFightCapturingModes(sim);
    expect(modes).not.toContain("loot");
    expect(sim.getSnapshot().mode).toBe("run_won");
  });

  it("chooseLevelUp/chooseLoot are no-ops outside their own mode", () => {
    const sim = bootstrapMathquestSim({ seed: 1 });
    const mapSnap = sim.getSnapshot();
    sim.chooseLevelUp(0);
    sim.chooseLoot(0);
    expect(sim.getSnapshot()).toEqual(mapSnap);

    const nodeId = findCombatNodeId(sim);
    if (nodeId === undefined) throw new Error("seed 1's reachable ids have no combat node");
    sim.chooseNode(nodeId);
    const combatSnap = sim.getSnapshot();
    expect(combatSnap.mode).toBe("combat");
    sim.chooseLevelUp(0);
    sim.chooseLoot(0);
    expect(sim.getSnapshot()).toEqual(combatSnap);
  });

  it("chooseNode/chooseAction are ignored while mode is 'level_up' or 'loot'", () => {
    const sim = bootstrapMathquestSim({ seed: 1 });
    const nodeId = findCombatNodeId(sim);
    if (nodeId === undefined) throw new Error("seed 1's reachable ids have no combat node");
    scriptExactWin(sim, nodeId, 2); // exactly crosses 1 threshold -> mode "level_up"
    const levelUpSnap = sim.getSnapshot();
    expect(levelUpSnap.mode).toBe("level_up");
    sim.chooseNode(nodeId);
    sim.chooseAction("attack");
    sim.chooseLoot(0);
    expect(sim.getSnapshot()).toEqual(levelUpSnap);

    sim.chooseLevelUp(0);
    const lootSnap = sim.getSnapshot();
    expect(lootSnap.mode).toBe("loot");
    sim.chooseNode(nodeId);
    sim.chooseAction("attack");
    sim.chooseLevelUp(0);
    expect(sim.getSnapshot()).toEqual(lootSnap);
  });
});

describe("bootstrapMathquestSim — M4a determinism guard", () => {
  it("the SAME seed + the SAME command script (including chooseLevelUp/chooseLoot) yields an IDENTICAL snapshot sequence", () => {
    function run(): GameSnapshot[] {
      const sim = bootstrapMathquestSim({ seed: 1 });
      const nodeId = findCombatNodeId(sim);
      if (nodeId === undefined) throw new Error("seed 1's reachable ids have no combat node");
      const snapshots: GameSnapshot[] = [sim.getSnapshot()];
      scriptExactWin(sim, nodeId, 12); // multi-level win
      snapshots.push(sim.getSnapshot());
      sim.chooseLevelUp(0);
      snapshots.push(sim.getSnapshot());
      sim.chooseLevelUp(0);
      snapshots.push(sim.getSnapshot());
      sim.chooseLoot(0);
      snapshots.push(sim.getSnapshot());
      return snapshots;
    }
    const a = run();
    const b = run();
    expect(a.length).toBeGreaterThan(1);
    expect(a).toEqual(b);
  });
});

// =================================================================================================
// M4b — math lifelines (corpus/todos/2026-07-23-mathquest-M4b-lifelines.md)
// =================================================================================================

/** Enters combat at a `"combat"`-type node (see `findCombatNodeId`) and advances to `"await_answer"`
 * via a fixed `"attack"` action — the minimal setup every M4b driver-level test needs before
 * calling `sim.useLifeline`. */
function enterAwaitAnswer(sim: BootedMathquestSim, nodeId: number): void {
  sim.chooseNode(nodeId);
  const snap = sim.getSnapshot();
  if (snap.mode !== "combat") throw new Error("enterAwaitAnswer: chooseNode didn't start a fight");
  sim.chooseAction("attack");
}

/** Searches seeds for a combat node whose FIRST pending problem is of the given `kind` — mirrors
 * `combat/combat.test.ts`'s `findFirstProblemOfKind`, but through the RUN driver. */
function findRunWithProblemKind(
  kind: "typed" | "choice",
  limit = 100,
): { sim: BootedMathquestSim; nodeId: number; view: ProblemView } {
  for (let seed = 1; seed <= limit; seed++) {
    const sim = bootstrapMathquestSim({ seed });
    const nodeId = findCombatNodeId(sim);
    if (nodeId === undefined) continue;
    enterAwaitAnswer(sim, nodeId);
    const snap = sim.getSnapshot();
    if (snap.mode !== "combat") continue;
    const view = snap.combat.problem;
    if (view !== null && view.kind === kind) return { sim, nodeId, view };
  }
  throw new Error(`findRunWithProblemKind: no ${kind} problem found in ${limit} seeds`);
}

describe("bootstrapMathquestSim — M4b starting kit + charge economy", () => {
  it("a fresh run starts with STARTING_LIFELINES ({hint:1,fifty:1,skip:1})", () => {
    const sim = bootstrapMathquestSim({ seed: 1 });
    expect(sim.getSnapshot().run.lifelines).toEqual(STARTING_LIFELINES);
  });

  it("a successful hint decrements exactly hint by 1, leaving fifty/skip untouched", () => {
    const sim = bootstrapMathquestSim({ seed: 1 });
    const nodeId = findCombatNodeId(sim);
    if (nodeId === undefined) throw new Error("seed 1 has no combat node");
    enterAwaitAnswer(sim, nodeId);
    sim.useLifeline("hint");
    const snap = sim.getSnapshot();
    expect(snap.run.lifelines).toEqual({ ...STARTING_LIFELINES, hint: 0 });
    if (snap.mode === "combat") expect(snap.combat.hint).not.toBeNull();
  });

  it("a repeat hint on the SAME problem spends NO further charge (stays at 0, not negative)", () => {
    const sim = bootstrapMathquestSim({ seed: 1 });
    const nodeId = findCombatNodeId(sim);
    if (nodeId === undefined) throw new Error("seed 1 has no combat node");
    enterAwaitAnswer(sim, nodeId);
    sim.useLifeline("hint");
    expect(sim.getSnapshot().run.lifelines.hint).toBe(0);
    sim.useLifeline("hint"); // charges already 0 -> the driver's own `lifelines[kind] <= 0` guard fires
    expect(sim.getSnapshot().run.lifelines.hint).toBe(0);
  });

  it("useLifeline at 0 charges is a no-op: combat is untouched (no hint applied)", () => {
    const sim = bootstrapMathquestSim({ seed: 1 });
    const nodeId = findCombatNodeId(sim);
    if (nodeId === undefined) throw new Error("seed 1 has no combat node");
    enterAwaitAnswer(sim, nodeId);
    sim.useLifeline("hint"); // spend the only hint charge
    expect(sim.getSnapshot().run.lifelines.hint).toBe(0);
    const before = sim.getSnapshot();
    sim.useLifeline("hint"); // 0 charges -> driver returns before ever calling combat.useLifeline
    expect(sim.getSnapshot()).toEqual(before);
  });

  it("fifty on a TYPED problem is a no-op at the driver level too: charge unchanged, combat unchanged", () => {
    const { sim, view } = findRunWithProblemKind("typed");
    expect(view.kind).toBe("typed");
    const before = sim.getSnapshot();
    sim.useLifeline("fifty");
    const after = sim.getSnapshot();
    expect(after).toEqual(before);
    expect(after.run.lifelines.fifty).toBe(STARTING_LIFELINES.fifty); // no charge spent
  });

  it("fifty on a CHOICE problem spends exactly 1 charge and disables one wrong choice", () => {
    const { sim, view } = findRunWithProblemKind("choice");
    expect(view.kind).toBe("choice");
    sim.useLifeline("fifty");
    const snap = sim.getSnapshot();
    expect(snap.run.lifelines.fifty).toBe(STARTING_LIFELINES.fifty - 1);
    if (snap.mode !== "combat" || snap.combat.problem === null || snap.combat.problem.kind !== "choice") {
      throw new Error("unreachable");
    }
    expect(snap.combat.problem.disabledChoices.length).toBe(1);
  });

  it("skip spends exactly 1 charge, lands the action, and a fight-ending skip resolves the run (resolveCombatIfOver runs)", () => {
    const sim = bootstrapMathquestSim({ seed: 5 });
    const nodeId = findCombatNodeId(sim);
    if (nodeId === undefined) throw new Error("seed 5 has no combat node");
    // ENEMY_ARCHETYPES.combat's 24 maxHp / ATTACK_DAMAGE (8) = exactly 3 skips to kill.
    enterAwaitAnswer(sim, nodeId);
    sim.useLifeline("skip");
    expect(sim.getSnapshot().mode).toBe("combat"); // 2 hits left — fight still going
    expect(sim.getSnapshot().run.lifelines.skip).toBe(0); // the run's ONLY skip charge, now spent

    // Second skip attempt: 0 charges left -> driver no-ops (never calls combat.useLifeline again).
    if (sim.getSnapshot().mode === "combat") {
      const before = sim.getSnapshot();
      sim.useLifeline("skip");
      expect(sim.getSnapshot()).toEqual(before);
    }
  });

  it("skip earns 0 xp relative to a solved fight (driver-level xp check)", () => {
    const sim = bootstrapMathquestSim({ seed: 5 });
    const nodeId = findCombatNodeId(sim);
    if (nodeId === undefined) throw new Error("seed 5 has no combat node");
    enterAwaitAnswer(sim, nodeId);
    const before = sim.getSnapshot().run.xp;
    sim.useLifeline("skip");
    expect(sim.getSnapshot().run.xp).toBe(before); // 0 xp earned by a skip
  });
});

describe("bootstrapMathquestSim — M4b loot grants charges (not stats)", () => {
  it("taking a lifeline-granting loot item adds its charges to run.lifelines and leaves stats untouched by that item's (empty) bonus", () => {
    let found = false;
    for (let seed = 1; seed <= 200 && !found; seed++) {
      const sim = bootstrapMathquestSim({ seed });
      const nodeId = findCombatNodeId(sim);
      if (nodeId === undefined) continue;
      scriptExactWin(sim, nodeId, 0); // straight to loot (below the first xp threshold)
      const lootSnap = sim.getSnapshot();
      if (lootSnap.mode !== "loot") continue;
      const idx = lootSnap.offers.findIndex((o) => o.lifeline !== undefined);
      if (idx === -1) continue; // this seed's 3 offers had no lifeline item — try another

      const item = lootSnap.offers[idx]!;
      const before = lootSnap.run.lifelines;
      sim.chooseLoot(idx);
      const after = sim.getSnapshot().run;
      const kind = item.lifeline!.kind;
      expect(after.lifelines[kind]).toBe(before[kind] + item.lifeline!.charges);
      // A pure-lifeline item's bonus is {} — stats must be unaffected by THIS pickup.
      expect(after.stats).toEqual(foldItemBonus(lootSnap.run.stats, item.bonus));
      found = true;
    }
    expect(found).toBe(true);
  });
});

describe("bootstrapMathquestSim — M4b off-mode + reset", () => {
  it("useLifeline is ignored while mode is 'map'", () => {
    const sim = bootstrapMathquestSim({ seed: 1 });
    const before = sim.getSnapshot();
    sim.useLifeline("hint");
    sim.useLifeline("fifty");
    sim.useLifeline("skip");
    expect(sim.getSnapshot()).toEqual(before);
  });

  it("useLifeline is ignored while mode is 'level_up' or 'loot'", () => {
    const sim = bootstrapMathquestSim({ seed: 1 });
    const nodeId = findCombatNodeId(sim);
    if (nodeId === undefined) throw new Error("seed 1 has no combat node");
    scriptExactWin(sim, nodeId, 2); // crosses exactly 1 threshold -> "level_up"
    const levelUpSnap = sim.getSnapshot();
    expect(levelUpSnap.mode).toBe("level_up");
    sim.useLifeline("hint");
    expect(sim.getSnapshot()).toEqual(levelUpSnap);

    sim.chooseLevelUp(0);
    const lootSnap = sim.getSnapshot();
    expect(lootSnap.mode).toBe("loot");
    sim.useLifeline("hint");
    expect(sim.getSnapshot()).toEqual(lootSnap);
  });

  it("newRun() resets lifelines to STARTING_LIFELINES, even after charges were spent/granted", () => {
    const sim = bootstrapMathquestSim({ seed: 1 });
    const nodeId = findCombatNodeId(sim);
    if (nodeId === undefined) throw new Error("seed 1 has no combat node");
    enterAwaitAnswer(sim, nodeId);
    sim.useLifeline("hint"); // spend a charge, so the reset actually has to do something
    expect(sim.getSnapshot().run.lifelines.hint).toBe(0);

    // Drive to a loss (always wrong, always attack) to reach newRun-eligible mode.
    let guard = 0;
    while (sim.getSnapshot().mode === "combat" && guard++ < 300) {
      const snap = sim.getSnapshot();
      if (snap.mode !== "combat") break;
      if (snap.combat.phase === "await_action") sim.chooseAction("attack");
      else if (snap.combat.phase === "await_answer") {
        sim.submitAnswer({ kind: "typed", value: -999999 }); // always wrong regardless of kind
      } else if (snap.combat.phase === "teach") sim.acknowledgeTeach();
    }
    expect(sim.getSnapshot().mode).toBe("run_lost");
    sim.newRun();
    expect(sim.getSnapshot().run.lifelines).toEqual(STARTING_LIFELINES);
  });
});

describe("bootstrapMathquestSim — M4b determinism guard", () => {
  it("the SAME seed + the SAME command script (including useLifeline) yields an IDENTICAL snapshot sequence", () => {
    function run(): GameSnapshot[] {
      const sim = bootstrapMathquestSim({ seed: 1 });
      const nodeId = findCombatNodeId(sim);
      if (nodeId === undefined) throw new Error("seed 1 has no combat node");
      const snapshots: GameSnapshot[] = [sim.getSnapshot()];
      enterAwaitAnswer(sim, nodeId);
      snapshots.push(sim.getSnapshot());
      sim.useLifeline("hint");
      snapshots.push(sim.getSnapshot());
      sim.useLifeline("fifty"); // no-op on a typed problem, or applies on a choice one — either way, deterministic
      snapshots.push(sim.getSnapshot());
      return snapshots;
    }
    const a = run();
    const b = run();
    expect(a.length).toBeGreaterThan(1);
    expect(a).toEqual(b);
  });
});

// =================================================================================================
// M4c — persistent per-topic mastery (corpus/todos/2026-07-23-mathquest-M4c-persistent-mastery.md)
// =================================================================================================

function totalAttempts(mastery: MasteryStore): number {
  return Object.values(mastery.topics).reduce((s, t) => s + t.attempts, 0);
}
function totalCorrect(mastery: MasteryStore): number {
  return Object.values(mastery.topics).reduce((s, t) => s + t.correct, 0);
}

describe("bootstrapMathquestSim — M4c mastery defaults + accrual", () => {
  it("a fresh run with no mastery option starts with EMPTY_MASTERY_STORE on run.mastery", () => {
    const sim = bootstrapMathquestSim({ seed: 1 });
    expect(sim.getSnapshot().run.mastery).toEqual(EMPTY_MASTERY_STORE);
  });

  it("boots with a PASSED-IN mastery store verbatim", () => {
    const mastery = highMasteryStore();
    const sim = bootstrapMathquestSim({ seed: 1, mastery });
    expect(sim.getSnapshot().run.mastery).toEqual(mastery);
  });

  it("a win's per-topic solves fold into run.mastery, visible in the very next snapshot", () => {
    const sim = bootstrapMathquestSim({ seed: 1 });
    const nodeId = findCombatNodeId(sim);
    if (nodeId === undefined) throw new Error("seed 1 has no combat node");
    scriptExactWin(sim, nodeId, 2); // 2 shields + 3 attacks = 5 correct solves, all landed
    const after = sim.getSnapshot().run.mastery;
    expect(totalAttempts(after)).toBe(5);
    expect(totalCorrect(after)).toBe(5);
  });
});

describe("bootstrapMathquestSim — M4c the elite gate is wired to the persistent store", () => {
  it("a fresh (EMPTY_MASTERY_STORE) run generates NO elite node anywhere, across many seeds", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const sim = bootstrapMathquestSim({ seed });
      expect(sim.getSnapshot().run.map.nodes.some((n) => n.type === "elite")).toBe(false);
    }
  });

  it("a tier-2+ mastery store DOES let an elite appear for some seed (the gate is genuinely open)", () => {
    let found = false;
    for (let seed = 1; seed <= 30 && !found; seed++) {
      const sim = bootstrapMathquestSim({ seed, mastery: highMasteryStore() });
      if (sim.getSnapshot().run.map.nodes.some((n) => n.type === "elite")) found = true;
    }
    expect(found).toBe(true);
  });

  it("newRun() recomputes eliteUnlocked from the CURRENT persisted store (not a stale snapshot from boot)", () => {
    // Boot EMPTY (gate closed) -> lose -> newRun(): still closed (mastery never earned anything).
    const closedSim = bootstrapMathquestSim({ seed: 1 });
    closedSim.chooseNode(closedSim.getSnapshot().run.reachableIds[0]!);
    driveCombatToLoss(closedSim);
    closedSim.newRun();
    expect(overallMasteryTier(closedSim.getSnapshot().run.mastery)).toBeLessThan(ELITE_UNLOCK_TIER);
    for (let seed = 1; seed <= 10; seed++) {
      // Re-verify via a FRESH boot at the same (still-closed) mastery level for a wider seed
      // sweep — the closedSim itself only has ONE post-newRun map to inspect.
      const sim = bootstrapMathquestSim({ seed, mastery: closedSim.getSnapshot().run.mastery });
      expect(sim.getSnapshot().run.map.nodes.some((n) => n.type === "elite")).toBe(false);
    }
  });
});

describe("bootstrapMathquestSim — M4c blueprint loot", () => {
  it("an already-unlocked blueprint's item can appear among loot offers", () => {
    let found = false;
    for (let seed = 1; seed <= 200 && !found; seed++) {
      const mastery: MasteryStore = { ...EMPTY_MASTERY_STORE, blueprints: [BLUEPRINTS.multiplication.id] };
      const sim = bootstrapMathquestSim({ seed, mastery });
      const nodeId = findCombatNodeId(sim);
      if (nodeId === undefined) continue;
      scriptExactWin(sim, nodeId, 0); // below the first xp threshold -> straight to loot
      const snap = sim.getSnapshot();
      if (snap.mode !== "loot") continue;
      if (snap.offers.some((o) => o.id === BLUEPRINTS.multiplication.item.id)) found = true;
    }
    expect(found).toBe(true);
  });

  it("with NO blueprints unlocked, loot offers never include a blueprint item (nothing to widen the pool with)", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const sim = bootstrapMathquestSim({ seed }); // EMPTY_MASTERY_STORE -> blueprints: []
      const nodeId = findCombatNodeId(sim);
      if (nodeId === undefined) continue;
      scriptExactWin(sim, nodeId, 0);
      const snap = sim.getSnapshot();
      if (snap.mode !== "loot") continue;
      const blueprintIds = new Set(Object.values(BLUEPRINTS).map((b) => b.item.id));
      for (const offer of snap.offers) expect(blueprintIds.has(offer.id)).toBe(false);
    }
  });
});

describe("bootstrapMathquestSim — M4c persistence across death", () => {
  it("a LOSS still folds topicOutcomes into run.mastery (mastery is honest — it survives death)", () => {
    const sim = bootstrapMathquestSim({ seed: 1 });
    sim.chooseNode(sim.getSnapshot().run.reachableIds[0]!);
    driveCombatToLoss(sim); // always attack, always wrong
    const lostSnap = sim.getSnapshot();
    expect(lostSnap.mode).toBe("run_lost");
    expect(totalAttempts(lostSnap.run.mastery)).toBeGreaterThan(0); // the loss's wrong solves WERE recorded
    expect(totalCorrect(lostSnap.run.mastery)).toBe(0); // every one of them was wrong
  });

  it("newRun() KEEPS mastery unchanged while resetting xp/level/stats/inventory/lifelines", () => {
    const sim = bootstrapMathquestSim({ seed: 1 });
    sim.chooseNode(sim.getSnapshot().run.reachableIds[0]!);
    driveCombatToLoss(sim);
    const lostSnap = sim.getSnapshot();
    expect(lostSnap.mode).toBe("run_lost");

    sim.newRun();
    const after = sim.getSnapshot();
    expect(after.mode).toBe("map");
    expect(after.run.mastery).toEqual(lostSnap.run.mastery); // UNCHANGED by newRun — the one field that survives
    expect(after.run.level).toBe(1);
    expect(after.run.xp).toBe(0);
    expect(after.run.stats).toEqual(ZERO_STATS);
    expect(after.run.inventory).toEqual([]);
    expect(after.run.lifelines).toEqual(STARTING_LIFELINES);
  });

  it("mastery also survives a WIN-then-newRun (not just a loss)", () => {
    const sim = bootstrapMathquestSim({ seed: 1 });
    const nodeId = findCombatNodeId(sim);
    if (nodeId === undefined) throw new Error("seed 1 has no combat node");
    scriptExactWin(sim, nodeId, 0); // straight to loot
    const wonSnap = sim.getSnapshot();
    expect(totalAttempts(wonSnap.run.mastery)).toBeGreaterThan(0);
    sim.chooseLoot(-1);
    expect(sim.getSnapshot().run.mastery).toEqual(wonSnap.run.mastery); // loot pickup never touches mastery
  });
});

describe("bootstrapMathquestSim — M4c determinism guard", () => {
  it("the SAME (seed, mastery, command script) -> an IDENTICAL snapshot sequence (map, loot, mastery all included)", () => {
    const mastery = highMasteryStore();
    function run(): GameSnapshot[] {
      const sim = bootstrapMathquestSim({ seed: 3, mastery });
      const snapshots: GameSnapshot[] = [sim.getSnapshot()];
      const nodeId = findCombatNodeId(sim);
      if (nodeId !== undefined) {
        scriptExactWin(sim, nodeId, 1);
        snapshots.push(sim.getSnapshot());
      }
      return snapshots;
    }
    const a = run();
    const b = run();
    expect(a.length).toBeGreaterThan(1);
    expect(a).toEqual(b);
  });

  it("a DIFFERENT mastery store (same seed, same script) can produce a DIFFERENT map (mastery is a genuine fork input)", () => {
    function run(mastery: MasteryStore): GameSnapshot {
      const sim = bootstrapMathquestSim({ seed: 1, mastery });
      return sim.getSnapshot();
    }
    const empty = run(EMPTY_MASTERY_STORE);
    const high = run(highMasteryStore());
    expect(empty.run.map).not.toEqual(high.run.map); // the elite slot differs
  });
});
