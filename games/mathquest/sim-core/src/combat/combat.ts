/**
 * MateQuest — the reusable combat factory. Extracted from `sim-bootstrap.ts` for M3
 * (corpus/todos/2026-07-22-mathquest-M3-map-and-runs.md, Part A0) so the run layer can create ONE
 * fresh fight per chosen map node instead of owning a single hardcoded fight, as M1/M2 did.
 *
 * ALL M1/M2 combat behavior is preserved verbatim: the action/answer/teach/re-queue state
 * machine, the `lastPlayer`/`lastEnemy` cue split, and the `answer`/`answerIndex` non-leak
 * (`toProblemView` is still the ONE place a `Problem` is narrowed to a `ProblemView`). What
 * changed is WHERE a fight's starting numbers come from: the enemy's identity
 * (`EnemyArchetype` — `run/enemies.ts`) and the warrior's starting HP (persisted in from the run)
 * are now `CombatOpts` parameters instead of module-level constants, and grade is fixed for the
 * WHOLE fight (no more M2 `setGrade` — the run's chosen map node decides difficulty now).
 *
 * Determinism (root CLAUDE.md): `createCombat` consumes ONLY the `Rng` it's handed — the run
 * layer forks a per-node child (`rng.fork(`node:${id}`)`) before calling this — never
 * `Math.random()`/`Date.now()`.
 */
import type { Rng } from "@engine/core";
import { ATTACK_DAMAGE, HEAL_AMOUNT, SHIELD_BLOCK } from "./constants";
import { GENERATORS, TOPICS_FOR_GRADE } from "./generators";
import { rollEnemyIntent } from "./logic";
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
} from "./types";
import type { EnemyArchetype } from "../run/enemies";

/** Options the run hands `createCombat` for ONE fight (M3 brief, Part A0). */
export interface CombatOpts {
  /** Per-fight child Rng — the run forks this (`rng.fork(`node:${id}`)`) before calling. */
  readonly rng: Rng;
  /** This fight's difficulty, fixed for its whole duration — comes from the chosen map node, not
   * a manual selector (M2's `setGrade` is gone). */
  readonly grade: Grade;
  /** Warrior HP carried in from the run — persists across fights. */
  readonly warriorHp: number;
  readonly warriorMaxHp: number;
  /** The enemy this fight is against — see `run/enemies.ts`'s `ENEMY_ARCHETYPES`. */
  readonly enemy: EnemyArchetype;
}

/** `null` while the fight is ongoing; set exactly once, the instant it ends. */
export interface CombatResult {
  readonly outcome: "won" | "lost";
  readonly warriorHp: number;
}

/** One fight, created fresh per map node. Same command surface as the M1/M2 sim (renamed
 * `getSnapshot` -> `snapshot`, per the M3 brief), plus `result()`, which the run layer polls
 * after every command to learn when/how the fight ended. */
export interface Combat {
  /** Valid only in `"await_action"`; ignored otherwise. See the M2 `sim-bootstrap.ts` doc this
   * was extracted from for the exact re-queue/topic-pick sequencing. */
  chooseAction(action: CombatAction): void;
  /** Valid only in `"await_answer"`; ignored otherwise. */
  submitAnswer(response: AnswerResponse): void;
  /** Valid only in `"teach"`; ignored otherwise. */
  acknowledgeTeach(): void;
  /** Returns a snapshot of the current fight (render/transport boundary; the M2 `CombatSnapshot`
   * shape, unchanged). */
  snapshot(): CombatSnapshot;
  /** `null` while fighting; set once the fight ends (`"won"` or `"lost"`), carrying the final
   * warrior HP for the run layer to persist. */
  result(): CombatResult | null;
}

/** Mutable internal state — never handed out directly; `snapshot()` projects it. Verbatim from
 * the M1/M2 `sim-bootstrap.ts`'s `CombatState`, minus the fields now captured as fixed closures
 * over `CombatOpts` (`grade`/`warriorMaxHp`/the enemy's `name`/`maxHp` never change within ONE
 * fight, unlike M2's mid-fight `setGrade`). */
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
   * module — see `toProblemView` and `snapshot()`. */
  pendingProblem: Problem | null;
  /** FIFO of missed problems awaiting a later turn (light spaced repetition, M2 brief A4).
   * `chooseAction` pops the FRONT before generating a fresh problem. */
  requeue: Problem[];
  /** The worked-step text for the missed problem, set on a wrong answer, cleared by
   * `acknowledgeTeach`. */
  teach: string | null;
  turn: number;
  lastPlayer: PlayerResult;
  lastEnemy: EnemyResult;
}

/** Narrows a `Problem` (which carries the answer) down to its boundary-safe `ProblemView` — the
 * ONE place this happens. Never spread a `Problem` directly onto a snapshot. */
function toProblemView(problem: Problem): ProblemView {
  return problem.kind === "typed"
    ? { kind: "typed", topic: problem.topic, grade: problem.grade, prompt: problem.prompt }
    : { kind: "choice", topic: problem.topic, grade: problem.grade, prompt: problem.prompt, choices: problem.choices };
}

export function createCombat(opts: CombatOpts): Combat {
  const { rng, grade, warriorMaxHp, enemy } = opts;

  const state: CombatState = {
    phase: "await_action",
    warriorHp: opts.warriorHp,
    warriorBlock: 0,
    enemyHp: enemy.maxHp,
    enemyIntent: rollEnemyIntent(rng.fork("intent"), enemy.intentBase, enemy.intentRoll),
    pendingAction: null,
    pendingProblem: null,
    requeue: [],
    teach: null,
    turn: 1,
    lastPlayer: { kind: "none" },
    lastEnemy: { kind: "none" },
  };

  /** Pop the re-queue's FRONT, or generate a fresh problem for the fight's fixed `grade`. */
  function nextProblem(): Problem {
    const requeued = state.requeue.shift();
    if (requeued !== undefined) return requeued;
    const topics = TOPICS_FOR_GRADE[grade];
    const topic = rng.fork("topic").pick(topics);
    return GENERATORS[topic](rng.fork("problem"), grade);
  }

  /** Apply a CORRECT action's effect to `state`, returning the "amount" reported on the
   * resulting `{ kind: "landed" }` result. Heal reports the ACTUAL HP restored (capped at
   * `warriorMaxHp`), never overshooting what the bar visibly gained. */
  function applyAction(action: CombatAction): number {
    switch (action) {
      case "attack": {
        state.enemyHp = Math.max(0, state.enemyHp - ATTACK_DAMAGE);
        return ATTACK_DAMAGE;
      }
      case "heal": {
        const before = state.warriorHp;
        state.warriorHp = Math.min(warriorMaxHp, state.warriorHp + HEAL_AMOUNT);
        return state.warriorHp - before;
      }
      case "shield": {
        state.warriorBlock = SHIELD_BLOCK;
        return SHIELD_BLOCK;
      }
    }
  }

  /** Runs the enemy's turn: its telegraphed intent, absorbed by block first, then HP. Rolls the
   * NEXT intent and returns to `await_action` unless the hit was lethal (`"lost"`). */
  function runEnemyTurn(): void {
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

    state.enemyIntent = rollEnemyIntent(rng.fork("intent"), enemy.intentBase, enemy.intentRoll);
    state.phase = "await_action";
    state.turn += 1;
  }

  function chooseAction(action: CombatAction): void {
    if (state.phase !== "await_action") return; // ignore off-phase commands
    state.pendingAction = action;
    state.lastEnemy = { kind: "none" }; // don't let a stale enemy line linger
    state.pendingProblem = nextProblem();
    state.phase = "await_answer";
  }

  function submitAnswer(response: AnswerResponse): void {
    if (state.phase !== "await_answer") return; // ignore off-phase commands
    const action = state.pendingAction;
    const problem = state.pendingProblem;
    if (action === null || problem === null) return; // unreachable while await_answer, keeps this total

    const correct =
      problem.kind === "typed"
        ? response.kind === "typed" && response.value === problem.answer
        : response.kind === "choice" && response.index === problem.answerIndex;

    state.pendingAction = null;

    if (correct) {
      const amount = applyAction(action);
      state.lastPlayer = { kind: "landed", action, amount };
      state.pendingProblem = null;

      // The player's action may have already ended the fight (a killing Attack) — no enemy turn
      // in that case, and `lastPlayer` stays the "landed" hit that won it.
      if (state.enemyHp <= 0) {
        state.phase = "won";
        state.turn += 1;
        return;
      }

      runEnemyTurn();
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
    runEnemyTurn();
  }

  function snapshot(): CombatSnapshot {
    const enemyView: EnemyView = {
      hp: state.enemyHp,
      maxHp: enemy.maxHp,
      block: 0, // the enemy never blocks
      name: enemy.name,
      intent: state.enemyIntent,
    };
    return {
      phase: state.phase,
      warrior: { hp: state.warriorHp, maxHp: warriorMaxHp, block: state.warriorBlock },
      enemy: enemyView,
      // Load-bearing: only the display-safe `ProblemView` crosses this boundary.
      problem: state.pendingProblem !== null ? toProblemView(state.pendingProblem) : null,
      grade,
      teach: state.teach,
      turn: state.turn,
      lastPlayer: state.lastPlayer,
      lastEnemy: state.lastEnemy,
    };
  }

  function result(): CombatResult | null {
    if (state.phase === "won" || state.phase === "lost") {
      return { outcome: state.phase, warriorHp: state.warriorHp };
    }
    return null;
  }

  return { chooseAction, submitAnswer, acknowledgeTeach, snapshot, result };
}
