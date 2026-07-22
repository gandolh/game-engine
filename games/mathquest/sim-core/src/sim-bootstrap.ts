/**
 * MateQuest sim bootstrap — the deterministic RUN model (a branching node map of fights,
 * warrior HP persisting across them; see corpus/wiki/mathquest-overview.md).
 *
 * M1 (corpus/todos/2026-07-21-mathquest-M1-combat-loop.md) built the combat loop around a single
 * hardcoded fight. M2 (corpus/todos/2026-07-22-mathquest-M2-problem-generators.md) added the real
 * problem-generator seam. M3 (corpus/todos/2026-07-22-mathquest-M3-map-and-runs.md) wraps that
 * combat loop in a RUN: this file no longer owns a fight's internals directly — `combat/combat.ts`
 * (extracted, `createCombat`) does — it owns the branching `RunMap` (`run/map.ts`), which node the
 * player currently can/has reached, and warriorHp persisting across fights. `bootstrapMathquestSim`
 * keeps its M0/M1/M2 signature/shape (still hands back `world`/`scheduler`/`rng`/`step()`), so it
 * stays usable from:
 *   - a headless test, driving `chooseNode`/`chooseAction`/`submitAnswer`/`acknowledgeTeach`/
 *     `newRun` directly (this package's own `sim-bootstrap.test.ts`);
 *   - a browser Web Worker (`@mathquest/client`'s `src/worker/sim-worker.ts`), which paces
 *     `step()` on a wall-clock `setInterval` — pacing only. Run/combat state changes ONLY inside
 *     the five commands below, never inside `step()`, so a run's outcome depends solely on the
 *     (seed, command sequence) pair, never on wall-clock timing (determinism is load-bearing;
 *     see root CLAUDE.md's "Architecture essentials").
 *
 * No ECS gameplay (no entities to query/despawn) — `world`/`scheduler` are kept, empty, purely
 * for shape-compatibility with every other game's sim-core bootstrap and so a later milestone
 * (loot, mastery) has somewhere to hang systems without reshaping this file's return type.
 *
 * Determinism: ALL randomness flows through the seeded `rng` (`createRng`, `@engine/core`)
 * forked per named label — `rng.fork("map")` for the FIRST run's map, `rng.fork(`run:${n}`)` for
 * every `newRun()` after, `rng.fork(`node:${id}`)` for the child `Rng` handed to `createCombat`
 * at each chosen fight — never `Math.random()`/`Date.now()`. `Rng.fork` consumes a parent draw,
 * so the ORDER these forks happen in must stay identical run-to-run for the same command script
 * (it does — see `chooseNode`/`newRun` below).
 */
import { World, Scheduler, createRng, type Rng, type System, type SimContext } from "@engine/core";
import { createCombat, type Combat } from "./combat/combat";
import { WARRIOR_MAX_HP } from "./combat/constants";
import type { AnswerResponse, CombatAction, CombatSnapshot } from "./combat/types";
import { ENEMY_ARCHETYPES } from "./run/enemies";
import { generateMap, type MapNode, type RunMap } from "./run/map";
import { REST_HEAL } from "./run/constants";

export type {
  AnswerResponse,
  ChoiceProblem,
  CombatAction,
  CombatPhase,
  CombatSnapshot,
  CombatantView,
  EnemyResult,
  EnemyView,
  Grade,
  MathTopic,
  PlayerResult,
  Problem,
  ProblemKind,
  ProblemView,
  TypedProblem,
} from "./combat/types";
export type { EnemyArchetype, EnemyKind } from "./run/enemies";
export type { MapNode, NodeType, RunMap } from "./run/map";

/**
 * MateQuest's entity shape. No entities are spawned yet (the run/combat model is plain
 * closed-over state, not ECS) — this exists only so `World<MathquestEntity>` has a concrete
 * generic, matching every other game's sim-core (and ready for a later milestone's loot/mastery
 * entities without a breaking rename).
 */
export interface MathquestEntity {
  id?: number;
  [key: string]: unknown;
}

export interface MathquestSimOptions {
  /** Seed for the sim's root `Rng` — all future randomness must fork from this (never `Math.random()`). */
  seed: number;
}

/** The run's current top-level mode (M3 brief, Part A3/A4). */
export type RunMode = "map" | "combat" | "run_won" | "run_lost";

/** The run's state, exposed on every `GameSnapshot` variant (M3 brief, Part A4). */
export interface RunView {
  readonly map: RunMap;
  /** The id of the node the active `Combat` (if any) is being fought at; `null` outside combat. */
  readonly currentId: number | null;
  /** Node ids the player may currently `chooseNode` into. */
  readonly reachableIds: readonly number[];
  /** Node ids the player has finished (fought-and-won, or rested at), in visit order. */
  readonly visitedIds: readonly number[];
  /** Persists across fights within a run; resets to `warriorMaxHp` on `newRun()`. */
  readonly warriorHp: number;
  readonly warriorMaxHp: number;
}

/** The top-level sim/render boundary snapshot (M3 brief, Part A4) — discriminated by `mode`. The
 * M2 `answer`/`answerIndex` non-leak invariant still holds: `combat` is the unchanged M2
 * `CombatSnapshot`. */
export type GameSnapshot =
  | { readonly mode: "map"; readonly run: RunView }
  | { readonly mode: "combat"; readonly run: RunView; readonly combat: CombatSnapshot }
  | { readonly mode: "run_won"; readonly run: RunView }
  | { readonly mode: "run_lost"; readonly run: RunView };

export interface BootedMathquestSim {
  world: World<MathquestEntity>;
  scheduler: Scheduler;
  rng: Rng;
  /** Advances the sim by exactly one tick. Run/combat state never changes here — see the module doc. */
  step(): void;
  /** Returns a snapshot of the current run (render/transport boundary). */
  getSnapshot(): GameSnapshot;
  /**
   * Valid only in `"map"`, and only if `id` is in the current `reachableIds`; ignored otherwise
   * (no state change — the M3 brief's "unreachable node rejected"). A `"rest"` node heals
   * (`+REST_HEAL`, capped at `warriorMaxHp`), marks itself visited, and advances
   * `reachableIds` to its `next` — staying in `"map"`. A `"combat"`/`"elite"`/`"boss"` node
   * starts a fresh `Combat` (`rng.fork(`node:${id}`)`, that node's `grade` + `EnemyArchetype`,
   * the run's current `warriorHp`) and moves to `"combat"`.
   */
  chooseNode(id: number): void;
  /** Forwarded to the active `Combat` while `mode === "combat"`; ignored otherwise. Resolves the
   * run's state after (see `resolveCombatIfOver`) — a win persists `warriorHp` and (boss ⇒
   * `"run_won"`, else back to `"map"` with `reachableIds` = the node's `next`); a loss ⇒
   * `"run_lost"`. */
  chooseAction(action: CombatAction): void;
  /** Forwarded to the active `Combat` while `mode === "combat"`; ignored otherwise. */
  submitAnswer(response: AnswerResponse): void;
  /** Forwarded to the active `Combat` while `mode === "combat"`; ignored otherwise. */
  acknowledgeTeach(): void;
  /** Valid only in `"run_won"`/`"run_lost"`; ignored otherwise. Regenerates the map from a fresh
   * fork (`rng.fork(`run:${n}`)`), resets `warriorHp` to full, and returns to `"map"`. M3 carries
   * no meta-progression yet (that's M4) — a clean restart. */
  newRun(): void;
}

/**
 * Placeholder scheduler system: intentionally empty (no entities, no per-tick gameplay). Exists
 * purely so `step()` has something real to call and the ECS/Scheduler seam stays wired for a
 * later milestone, without `step()` itself ever touching run/combat state (see module doc).
 */
class NoopSystem implements System {
  readonly name = "NoopSystem";
  run(_ctx: SimContext): void {
    // Run/combat state changes ONLY inside chooseNode/chooseAction/submitAnswer/
    // acknowledgeTeach/newRun — never here.
  }
}

export function bootstrapMathquestSim(opts: MathquestSimOptions): BootedMathquestSim {
  const rng = createRng(opts.seed);
  const world = new World<MathquestEntity>();

  const scheduler = new Scheduler();
  scheduler.stage("TICK").add(new NoopSystem());

  const warriorMaxHp = WARRIOR_MAX_HP;

  let runCount = 0;
  let map: RunMap = generateMap(rng.fork("map"));
  let warriorHp = warriorMaxHp;
  let currentId: number | null = null;
  let reachableIds: readonly number[] = map.startIds;
  let visitedIds: readonly number[] = [];
  let mode: RunMode = "map";
  let combat: Combat | null = null;
  let frameCount = 0;

  function nodeById(id: number): MapNode | undefined {
    return map.nodes.find((n) => n.id === id);
  }

  function chooseNode(id: number): void {
    if (mode !== "map") return; // ignore off-mode commands
    if (!reachableIds.includes(id)) return; // unreachable — no state change
    const node = nodeById(id);
    if (node === undefined) return;

    if (node.type === "rest") {
      warriorHp = Math.min(warriorMaxHp, warriorHp + REST_HEAL);
      visitedIds = [...visitedIds, id];
      reachableIds = node.next;
      return; // stays in "map"
    }

    currentId = id;
    combat = createCombat({
      rng: rng.fork(`node:${id}`),
      grade: node.grade,
      warriorHp,
      warriorMaxHp,
      enemy: ENEMY_ARCHETYPES[node.type],
    });
    mode = "combat";
  }

  /** After forwarding a command to `combat`, resolve the run's state if the fight just ended.
   * No-op while the fight is still going (`combat.result()` is `null`). */
  function resolveCombatIfOver(): void {
    if (combat === null || currentId === null) return;
    const result = combat.result();
    if (result === null) return;

    warriorHp = result.warriorHp;
    const node = nodeById(currentId);
    combat = null;
    currentId = null;

    if (result.outcome === "lost") {
      mode = "run_lost";
      return;
    }

    // won
    if (node !== undefined && node.type === "boss") {
      mode = "run_won";
      return;
    }
    if (node !== undefined) {
      visitedIds = [...visitedIds, node.id];
      reachableIds = node.next;
    }
    mode = "map";
  }

  function chooseAction(action: CombatAction): void {
    if (mode !== "combat" || combat === null) return; // ignore off-mode commands
    combat.chooseAction(action);
    resolveCombatIfOver();
  }

  function submitAnswer(response: AnswerResponse): void {
    if (mode !== "combat" || combat === null) return; // ignore off-mode commands
    combat.submitAnswer(response);
    resolveCombatIfOver();
  }

  function acknowledgeTeach(): void {
    if (mode !== "combat" || combat === null) return; // ignore off-mode commands
    combat.acknowledgeTeach();
    resolveCombatIfOver();
  }

  function newRun(): void {
    if (mode !== "run_won" && mode !== "run_lost") return; // ignore off-mode commands
    runCount += 1;
    map = generateMap(rng.fork(`run:${runCount}`));
    warriorHp = warriorMaxHp;
    currentId = null;
    reachableIds = map.startIds;
    visitedIds = [];
    combat = null;
    mode = "map";
  }

  function getSnapshot(): GameSnapshot {
    const run: RunView = { map, currentId, reachableIds, visitedIds, warriorHp, warriorMaxHp };
    switch (mode) {
      case "combat":
        // Invariant: mode is "combat" iff combat is non-null (set together in chooseNode, both
        // cleared together in resolveCombatIfOver) — see those two functions.
        return { mode: "combat", run, combat: combat!.snapshot() };
      case "map":
        return { mode: "map", run };
      case "run_won":
        return { mode: "run_won", run };
      case "run_lost":
        return { mode: "run_lost", run };
    }
  }

  return {
    world,
    scheduler,
    rng,
    step(): void {
      scheduler.tick({ tick: frameCount });
      frameCount++;
    },
    getSnapshot,
    chooseNode,
    chooseAction,
    submitAnswer,
    acknowledgeTeach,
    newRun,
  };
}

