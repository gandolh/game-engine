/**
 * MateQuest sim bootstrap — M1: the deterministic combat model (one warrior vs one enemy,
 * Pokémon-style action menu + Slay-the-Spire turn stakes; see corpus/wiki/mathquest-overview.md
 * and the M1 brief, corpus/todos/2026-07-21-mathquest-M1-combat-loop.md).
 *
 * Replaces M0's `TickCounterSystem` placeholder outright. `bootstrapMathquestSim` keeps its M0
 * signature/shape (still hands back `world`/`scheduler`/`rng`/`step()`/`getSnapshot()`) so it
 * stays usable from:
 *   - a headless test, driving `chooseAction`/`submitAnswer` directly (this package's own
 *     `sim-bootstrap.test.ts`);
 *   - a browser Web Worker (`@mathquest/client`'s `src/worker/sim-worker.ts`), which paces
 *     `step()` on a wall-clock `setInterval` — pacing only. Combat state changes ONLY inside the
 *     two new commands below, never inside `step()`, so a fight's outcome depends solely on the
 *     (seed, command sequence) pair, never on wall-clock timing (determinism is load-bearing;
 *     see root CLAUDE.md's "Architecture essentials").
 *
 * M1 has no ECS gameplay (no entities to query/despawn) — `world`/`scheduler` are kept, empty,
 * purely for shape-compatibility with every other game's sim-core bootstrap and so a later
 * milestone (map, loot, generators) has somewhere to hang systems without reshaping this file's
 * return type.
 *
 * Determinism: ALL randomness flows through the seeded `rng` (`createRng`, `@engine/core`)
 * forked per the M1 brief's exact labels — `rng.fork("problem")` for a problem's operands,
 * `rng.fork("intent")` for the enemy's next-turn intent — never `Math.random()`/`Date.now()`.
 */
import { World, Scheduler, createRng, type Rng, type System, type SimContext } from "@engine/core";
import {
  ATTACK_DAMAGE,
  ENEMY_MAX_HP,
  ENEMY_NAME,
  HEAL_AMOUNT,
  SHIELD_BLOCK,
  WARRIOR_MAX_HP,
} from "./combat/constants";
import { generateProblem, rollEnemyIntent } from "./combat/logic";
import type {
  CombatAction,
  CombatPhase,
  CombatSnapshot,
  EnemyView,
  LastResult,
  Problem,
} from "./combat/types";

export type {
  CombatAction,
  CombatPhase,
  CombatSnapshot,
  CombatantView,
  EnemyView,
  LastResult,
  Problem,
} from "./combat/types";

/**
 * MateQuest's M1 entity shape. No entities are spawned yet (combat is plain closed-over state,
 * not ECS) — this exists only so `World<MathquestEntity>` has a concrete generic, matching every
 * other game's sim-core (and ready for M2+'s map/loot entities without a breaking rename).
 */
export interface MathquestEntity {
  id?: number;
  [key: string]: unknown;
}

export interface MathquestSimOptions {
  /** Seed for the sim's root `Rng` — all future randomness must fork from this (never `Math.random()`). */
  seed: number;
}

/** Mutable internal combat state — never handed out directly; `getSnapshot()` projects it. */
interface CombatState {
  phase: CombatPhase;
  warriorHp: number;
  warriorBlock: number;
  enemyHp: number;
  enemyIntent: number;
  /** Set by `chooseAction`, consumed by `submitAnswer`. Never null while `phase === "await_answer"`. */
  pendingAction: CombatAction | null;
  /** Set by `chooseAction`, consumed by `submitAnswer`. `answer` NEVER leaves this module — see `getSnapshot()`. */
  pendingProblem: Problem | null;
  turn: number;
  last: LastResult;
}

function initialCombatState(rng: Rng): CombatState {
  return {
    phase: "await_action",
    warriorHp: WARRIOR_MAX_HP,
    warriorBlock: 0,
    enemyHp: ENEMY_MAX_HP,
    enemyIntent: rollEnemyIntent(rng.fork("intent")),
    pendingAction: null,
    pendingProblem: null,
    turn: 1,
    last: { kind: "none" },
  };
}

/**
 * Apply a CORRECT action's effect to `state` (mutates), returning the "amount" reported on the
 * resulting `{ kind: "landed" }` result. Attack/shield report their flat constant (8); heal
 * reports the ACTUAL HP restored (which can be less than `HEAL_AMOUNT` when near-capped) — a
 * "Heal! +3" cue at 27/30 HP is more honest than a flat "+8" that visibly overshoots the bar.
 */
function applyAction(state: CombatState, action: CombatAction): number {
  switch (action) {
    case "attack": {
      state.enemyHp = Math.max(0, state.enemyHp - ATTACK_DAMAGE);
      return ATTACK_DAMAGE;
    }
    case "heal": {
      const before = state.warriorHp;
      state.warriorHp = Math.min(WARRIOR_MAX_HP, state.warriorHp + HEAL_AMOUNT);
      return state.warriorHp - before;
    }
    case "shield": {
      state.warriorBlock = SHIELD_BLOCK;
      return SHIELD_BLOCK;
    }
  }
}

function projectSnapshot(state: CombatState): CombatSnapshot {
  const enemy: EnemyView = {
    hp: state.enemyHp,
    maxHp: ENEMY_MAX_HP,
    block: 0, // the enemy never blocks in M1
    name: ENEMY_NAME,
    intent: state.enemyIntent,
  };
  return {
    phase: state.phase,
    warrior: { hp: state.warriorHp, maxHp: WARRIOR_MAX_HP, block: state.warriorBlock },
    enemy,
    // Load-bearing: `state.pendingProblem?.prompt` copies ONLY the display text. The `Problem`
    // object itself (which carries `answer`) never crosses this boundary — see the module doc
    // and combat/types.ts's `CombatSnapshot.prompt` doc comment.
    prompt: state.pendingProblem?.prompt ?? null,
    turn: state.turn,
    last: state.last,
  };
}

export interface BootedMathquestSim {
  world: World<MathquestEntity>;
  scheduler: Scheduler;
  rng: Rng;
  /** Advances the sim by exactly one tick. M1: combat never changes here — see the module doc. */
  step(): void;
  /** Returns a snapshot of the current combat state (render/transport boundary). */
  getSnapshot(): CombatSnapshot;
  /**
   * Valid only in `await_action`; ignored otherwise. Sets the pending action, generates the
   * hardcoded problem via `rng.fork("problem")`, and moves to `await_answer`.
   */
  chooseAction(action: CombatAction): void;
  /**
   * Valid only in `await_answer`; ignored otherwise. Resolves the pending action against
   * `value` (correct ⇒ apply it; wrong ⇒ fizzle), then — unless that resolution already won the
   * fight — runs the enemy's turn (its telegraphed `intent` minus the warrior's `block`; block is
   * then consumed), rolls the next intent via `rng.fork("intent")`, and returns to `await_action`
   * (or `won`/`lost`).
   */
  submitAnswer(value: number): void;
}

/**
 * M1 placeholder scheduler system: intentionally empty (no entities, no per-tick gameplay).
 * Exists purely so `step()` has something real to call and the ECS/Scheduler seam stays wired
 * for a later milestone, without `step()` itself ever touching combat state (see module doc).
 */
class NoopSystem implements System {
  readonly name = "NoopSystem";
  run(_ctx: SimContext): void {
    // M1: combat state changes ONLY inside chooseAction/submitAnswer — never here.
  }
}

export function bootstrapMathquestSim(opts: MathquestSimOptions): BootedMathquestSim {
  const rng = createRng(opts.seed);
  const world = new World<MathquestEntity>();

  const scheduler = new Scheduler();
  scheduler.stage("TICK").add(new NoopSystem());

  const state = initialCombatState(rng);
  let frameCount = 0;

  function chooseAction(action: CombatAction): void {
    if (state.phase !== "await_action") return; // ignore off-phase commands (brief: "Ignore if not in await_action")
    state.pendingAction = action;
    state.pendingProblem = generateProblem(rng.fork("problem"));
    state.phase = "await_answer";
  }

  function submitAnswer(value: number): void {
    if (state.phase !== "await_answer") return; // ignore off-phase commands
    const action = state.pendingAction;
    const problem = state.pendingProblem;
    if (action === null || problem === null) return; // unreachable while await_answer, but keeps this fn total

    const correct = value === problem.answer;
    if (correct) {
      const amount = applyAction(state, action);
      state.last = { kind: "landed", action, amount };
    } else {
      state.last = { kind: "fizzle", action };
    }
    state.pendingAction = null;
    state.pendingProblem = null;

    // The player's action may have already ended the fight (a killing Attack) — no enemy turn
    // in that case, and `last` stays the "landed" hit that won it.
    if (state.enemyHp <= 0) {
      state.phase = "won";
      state.turn += 1;
      return;
    }

    // Enemy turn: its telegraphed intent, absorbed by block first, then HP. Block is consumed
    // whether or not it fully absorbed the hit.
    const blocked = Math.min(state.warriorBlock, state.enemyIntent);
    const damage = state.enemyIntent - blocked;
    state.warriorHp = Math.max(0, state.warriorHp - damage);
    state.warriorBlock = 0;
    state.last = { kind: "enemy_hit", amount: damage, blocked };

    if (state.warriorHp <= 0) {
      state.phase = "lost";
      state.turn += 1;
      return;
    }

    state.enemyIntent = rollEnemyIntent(rng.fork("intent"));
    state.phase = "await_action";
    state.turn += 1;
  }

  return {
    world,
    scheduler,
    rng,
    step(): void {
      scheduler.tick({ tick: frameCount });
      frameCount++;
    },
    getSnapshot(): CombatSnapshot {
      return projectSnapshot(state);
    },
    chooseAction,
    submitAnswer,
  };
}
