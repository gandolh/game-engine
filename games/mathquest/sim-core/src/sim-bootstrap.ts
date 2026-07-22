/**
 * MateQuest sim bootstrap — the deterministic combat model (one warrior vs one enemy,
 * Pokémon-style action menu + Slay-the-Spire turn stakes; see corpus/wiki/mathquest-overview.md).
 *
 * M1 (corpus/todos/2026-07-21-mathquest-M1-combat-loop.md) built the combat loop around a single
 * hardcoded `a + b` problem. M2 (corpus/todos/2026-07-22-mathquest-M2-problem-generators.md)
 * replaces that with the real problem-generator seam: `combat/generators.ts`'s `GENERATORS`
 * dispatches by (grade, topic); a new `"teach"` phase + FIFO `requeue` give a wrong answer a
 * worked-step + light spaced repetition; the M1 known-minor (a single `last` field getting
 * overwritten by the enemy's hit) is fixed by splitting it into `lastPlayer`/`lastEnemy`.
 *
 * `bootstrapMathquestSim` keeps its M0/M1 signature/shape (still hands back
 * `world`/`scheduler`/`rng`/`step()`/`getSnapshot()`) so it stays usable from:
 *   - a headless test, driving `chooseAction`/`submitAnswer`/`acknowledgeTeach`/`setGrade`
 *     directly (this package's own `sim-bootstrap.test.ts`);
 *   - a browser Web Worker (`@mathquest/client`'s `src/worker/sim-worker.ts`), which paces
 *     `step()` on a wall-clock `setInterval` — pacing only. Combat state changes ONLY inside the
 *     four commands below, never inside `step()`, so a fight's outcome depends solely on the
 *     (seed, command sequence) pair, never on wall-clock timing (determinism is load-bearing;
 *     see root CLAUDE.md's "Architecture essentials").
 *
 * No ECS gameplay (no entities to query/despawn) — `world`/`scheduler` are kept, empty, purely
 * for shape-compatibility with every other game's sim-core bootstrap and so a later milestone
 * (map, loot) has somewhere to hang systems without reshaping this file's return type.
 *
 * Determinism: ALL randomness flows through the seeded `rng` (`createRng`, `@engine/core`)
 * forked per named label — `rng.fork("intent")` for the enemy's next-turn intent, `rng.fork("topic")`
 * for a fresh turn's topic pick, `rng.fork("problem")` for that topic's generator (which may itself
 * fork `"shuffle"` for comparison's choice order) — never `Math.random()`/`Date.now()`.
 */
import { World, Scheduler, createRng, type Rng, type System, type SimContext } from "@engine/core";
import {
  ATTACK_DAMAGE,
  DEFAULT_GRADE,
  ENEMY_MAX_HP,
  ENEMY_NAME,
  HEAL_AMOUNT,
  SHIELD_BLOCK,
  WARRIOR_MAX_HP,
} from "./combat/constants";
import { GENERATORS, TOPICS_FOR_GRADE } from "./combat/generators";
import { rollEnemyIntent } from "./combat/logic";
import type {
  AnswerResponse,
  CombatAction,
  CombatPhase,
  CombatSnapshot,
  EnemyResult,
  EnemyView,
  Grade,
  PlayerResult,
  Problem,
  ProblemView,
} from "./combat/types";

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

/**
 * MateQuest's entity shape. No entities are spawned yet (combat is plain closed-over state, not
 * ECS) — this exists only so `World<MathquestEntity>` has a concrete generic, matching every
 * other game's sim-core (and ready for a later milestone's map/loot entities without a breaking
 * rename).
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
  /** Set by `chooseAction`, consumed by `submitAnswer`. Never null while `phase` is
   * `"await_answer"`; stays set through `"teach"` only long enough to be re-queued. */
  pendingAction: CombatAction | null;
  /** Set by `chooseAction`, consumed by `submitAnswer`. `answer`/`answerIndex` NEVER leave this
   * module — see `toProblemView` and `getSnapshot()`. */
  pendingProblem: Problem | null;
  /** The player's chosen difficulty. `setGrade` mutates it; `chooseAction` reads it for fresh draws. */
  currentGrade: Grade;
  /** FIFO of missed problems awaiting a later turn (light spaced repetition, M2 brief A4).
   * `chooseAction` pops the FRONT before generating a fresh problem. */
  requeue: Problem[];
  /** The worked-step text for the missed problem, set on a wrong answer, cleared by `acknowledgeTeach`. */
  teach: string | null;
  turn: number;
  lastPlayer: PlayerResult;
  lastEnemy: EnemyResult;
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
    currentGrade: DEFAULT_GRADE,
    requeue: [],
    teach: null,
    turn: 1,
    lastPlayer: { kind: "none" },
    lastEnemy: { kind: "none" },
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

/** Runs the enemy's turn: its telegraphed intent, absorbed by block first, then HP. Block is
 * consumed whether or not it fully absorbed the hit. Rolls the NEXT intent and returns to
 * `await_action` unless the hit was lethal (`"lost"`). Called from `submitAnswer` (correct path,
 * fight not already won) and from `acknowledgeTeach` (deferred wrong-answer path). */
function runEnemyTurn(state: CombatState, rng: Rng): void {
  const blocked = Math.min(state.warriorBlock, state.enemyIntent);
  const damage = state.enemyIntent - blocked;
  state.warriorHp = Math.max(0, state.warriorHp - damage);
  state.warriorBlock = 0;
  state.lastEnemy = { kind: "enemy_hit", amount: damage, blocked };

  if (state.warriorHp <= 0) {
    state.phase = "lost";
    state.turn += 1;
    return;
  }

  state.enemyIntent = rollEnemyIntent(rng.fork("intent"));
  state.phase = "await_action";
  state.turn += 1;
}

/** Narrows a `Problem` (which carries the answer) down to its boundary-safe `ProblemView` — the
 * ONE place this happens. Never spread a `Problem` directly onto a snapshot. */
function toProblemView(problem: Problem): ProblemView {
  return problem.kind === "typed"
    ? { kind: "typed", topic: problem.topic, grade: problem.grade, prompt: problem.prompt }
    : { kind: "choice", topic: problem.topic, grade: problem.grade, prompt: problem.prompt, choices: problem.choices };
}

function projectSnapshot(state: CombatState): CombatSnapshot {
  const enemy: EnemyView = {
    hp: state.enemyHp,
    maxHp: ENEMY_MAX_HP,
    block: 0, // the enemy never blocks
    name: ENEMY_NAME,
    intent: state.enemyIntent,
  };
  return {
    phase: state.phase,
    warrior: { hp: state.warriorHp, maxHp: WARRIOR_MAX_HP, block: state.warriorBlock },
    enemy,
    // Load-bearing: only the display-safe `ProblemView` crosses this boundary — see the module
    // doc and combat/types.ts's `CombatSnapshot.problem` doc comment.
    problem: state.pendingProblem !== null ? toProblemView(state.pendingProblem) : null,
    grade: state.currentGrade,
    teach: state.teach,
    turn: state.turn,
    lastPlayer: state.lastPlayer,
    lastEnemy: state.lastEnemy,
  };
}

export interface BootedMathquestSim {
  world: World<MathquestEntity>;
  scheduler: Scheduler;
  rng: Rng;
  /** Advances the sim by exactly one tick. Combat never changes here — see the module doc. */
  step(): void;
  /** Returns a snapshot of the current combat state (render/transport boundary). */
  getSnapshot(): CombatSnapshot;
  /**
   * Valid only in `await_action`; ignored otherwise. Sets the pending action, resets the stale
   * `lastEnemy` cue (M2 brief A5), pops a re-queued problem if any (light spaced repetition) or
   * else picks a fresh topic (`rng.fork("topic")`, from `TOPICS_FOR_GRADE[currentGrade]`) and
   * generates it (`rng.fork("problem")`), then moves to `await_answer`.
   */
  chooseAction(action: CombatAction): void;
  /**
   * Valid only in `await_answer`; ignored otherwise. Resolves the pending action against
   * `response` (matched by the problem's `kind`): correct ⇒ apply it, then run the enemy's turn
   * (or end the fight if the action was lethal) and return to `await_action`/`won`/`lost`. Wrong ⇒
   * fizzle, push the missed problem onto the FIFO `requeue`, set `teach`, and move to `"teach"` —
   * the enemy turn is DEFERRED until `acknowledgeTeach()`.
   */
  submitAnswer(response: AnswerResponse): void;
  /**
   * Valid only in `"teach"`; ignored otherwise. Clears `teach`, then runs the (already-fizzled)
   * enemy turn deferred by `submitAnswer`'s wrong-answer path, returning to `await_action`/`lost`.
   */
  acknowledgeTeach(): void;
  /** Sets the player's chosen grade (I–IV). Takes effect on the NEXT freshly-generated problem;
   * a re-queued problem keeps its ORIGINAL grade (the same problem comes back unchanged). */
  setGrade(grade: Grade): void;
}

/**
 * Placeholder scheduler system: intentionally empty (no entities, no per-tick gameplay). Exists
 * purely so `step()` has something real to call and the ECS/Scheduler seam stays wired for a
 * later milestone, without `step()` itself ever touching combat state (see module doc).
 */
class NoopSystem implements System {
  readonly name = "NoopSystem";
  run(_ctx: SimContext): void {
    // Combat state changes ONLY inside chooseAction/submitAnswer/acknowledgeTeach/setGrade — never here.
  }
}

export function bootstrapMathquestSim(opts: MathquestSimOptions): BootedMathquestSim {
  const rng = createRng(opts.seed);
  const world = new World<MathquestEntity>();

  const scheduler = new Scheduler();
  scheduler.stage("TICK").add(new NoopSystem());

  const state = initialCombatState(rng);
  let frameCount = 0;

  /** Pop the re-queue's FRONT, or generate a fresh problem for `state.currentGrade`. */
  function nextProblem(): Problem {
    const requeued = state.requeue.shift();
    if (requeued !== undefined) return requeued;
    const topics = TOPICS_FOR_GRADE[state.currentGrade];
    const topic = rng.fork("topic").pick(topics);
    return GENERATORS[topic](rng.fork("problem"), state.currentGrade);
  }

  function chooseAction(action: CombatAction): void {
    if (state.phase !== "await_action") return; // ignore off-phase commands
    state.pendingAction = action;
    state.lastEnemy = { kind: "none" }; // M2 brief A5: don't let a stale enemy line linger
    state.pendingProblem = nextProblem();
    state.phase = "await_answer";
  }

  function submitAnswer(response: AnswerResponse): void {
    if (state.phase !== "await_answer") return; // ignore off-phase commands
    const action = state.pendingAction;
    const problem = state.pendingProblem;
    if (action === null || problem === null) return; // unreachable while await_answer, but keeps this fn total

    const correct =
      problem.kind === "typed"
        ? response.kind === "typed" && response.value === problem.answer
        : response.kind === "choice" && response.index === problem.answerIndex;

    state.pendingAction = null;

    if (correct) {
      const amount = applyAction(state, action);
      state.lastPlayer = { kind: "landed", action, amount };
      state.pendingProblem = null;

      // The player's action may have already ended the fight (a killing Attack) — no enemy turn
      // in that case, and `lastPlayer` stays the "landed" hit that won it.
      if (state.enemyHp <= 0) {
        state.phase = "won";
        state.turn += 1;
        return;
      }

      runEnemyTurn(state, rng);
      return;
    }

    // Wrong: fizzle, re-queue the SAME problem, show the worked step, defer the enemy turn.
    state.lastPlayer = { kind: "fizzle", action };
    state.requeue.push(problem);
    state.teach = problem.teach;
    state.pendingProblem = null;
    state.phase = "teach";
  }

  function acknowledgeTeach(): void {
    if (state.phase !== "teach") return; // ignore off-phase commands
    state.teach = null;
    runEnemyTurn(state, rng);
  }

  function setGrade(grade: Grade): void {
    state.currentGrade = grade;
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
    acknowledgeTeach,
    setGrade,
  };
}
