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
 *
 * M4a (corpus/todos/2026-07-23-mathquest-M4a-progression-loot.md) adds two things, both opt-in
 * via `CombatOpts.mods` (defaults to all-zero — M1-M3 behaviour is byte-identical when omitted):
 * the run's accumulated `StatBonuses` now pad attack/heal/shield (`warriorMaxHp` itself already
 * carries the run's maxHp bonus — the driver folds that in before calling `createCombat`), and
 * every fight now reports `CombatResult.xpEarned` (sum of `xpForSolve(grade)` per CORRECT
 * `submitAnswer`) for the driver's level-up bookkeeping.
 *
 * M4b (corpus/todos/2026-07-23-mathquest-M4b-lifelines.md) adds `useLifeline(kind)`: a `hint`
 * reveals the pending problem's worked step early (`state.hintText`), a `fifty` disables one
 * WRONG choice on a comparison problem (`state.fiftyDisabled`, via a NEW `rng.fork("fifty")` —
 * added AFTER the existing `intent`/`topic`/`problem` forks, never reordering them), and a `skip`
 * auto-lands the pending action for 0 XP (reusing `applyAction`/`runEnemyTurn` verbatim). Both
 * `hintText`/`fiftyDisabled` reset to `null` whenever a NEW problem is set (`chooseAction`), so a
 * fight that never calls `useLifeline` stays byte-identical to M4a: `disabledChoices` is always
 * `[]`, `hint` is always `null`, and the `"fifty"` fork is never consumed.
 *
 * M4c (corpus/todos/2026-07-23-mathquest-M4c-persistent-mastery.md) adds `CombatResult.topicOutcomes`
 * — a per-topic `{correct, attempts}` tally accumulated over the WHOLE fight, so `sim-bootstrap.ts`
 * can fold it into the persistent `MasteryStore` on fight end (win OR loss). `submitAnswer` is the
 * ONLY place a solve's correctness is known, so it is the ONLY place this accumulator is touched: a
 * `hint`/`fifty` never calls it (the eventual `submitAnswer` records the attempt), and a `skip`
 * (M4b's `useLifeline("skip")`) explicitly bypasses `submitAnswer` — it was never SOLVED, so it adds
 * no attempt either. No new fork, no new snapshot field — `topicOutcomes` is exposed ONLY on
 * `CombatResult` (via `result()`), never on `CombatSnapshot`.
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
  MathTopic,
  PlayerResult,
  Problem,
  ProblemView,
} from "./types";
import type { EnemyArchetype } from "../run/enemies";
import type { LifelineKind } from "../run/lifelines";
import type { TopicMastery } from "../run/mastery";
import { xpForSolve, ZERO_STATS, type StatBonuses } from "../run/progression";

/** A fresh, all-zero per-topic accumulator — the fight's `topicOutcomes` starting point (mirrors
 * `run/mastery.ts`'s own zero-record shape; kept local so `combat.ts` doesn't need a value import
 * from `run/mastery.ts`, just the `TopicMastery` type). */
function zeroTopicOutcomes(): Record<MathTopic, TopicMastery> {
  return {
    addition: { correct: 0, attempts: 0 },
    subtraction: { correct: 0, attempts: 0 },
    multiplication: { correct: 0, attempts: 0 },
    comparison: { correct: 0, attempts: 0 },
  };
}

/** Options the run hands `createCombat` for ONE fight (M3 brief, Part A0; M4a adds `mods`). */
export interface CombatOpts {
  /** Per-fight child Rng — the run forks this (`rng.fork(`node:${id}`)`) before calling. */
  readonly rng: Rng;
  /** This fight's difficulty, fixed for its whole duration — comes from the chosen map node, not
   * a manual selector (M2's `setGrade` is gone). */
  readonly grade: Grade;
  /** Warrior HP carried in from the run — persists across fights. */
  readonly warriorHp: number;
  /** Already includes the run's `stats.maxHp` bonus — the driver computes the effective max
   * before calling `createCombat`; this module never adds `mods.maxHp` itself. */
  readonly warriorMaxHp: number;
  /** The enemy this fight is against — see `run/enemies.ts`'s `ENEMY_ARCHETYPES`. */
  readonly enemy: EnemyArchetype;
  /** Accumulated run stat bonuses (M4a — `run/progression.ts`'s `StatBonuses`). Optional,
   * defaulting to all-zero, so M1-M3 call sites (and their tests) see byte-identical behaviour. */
  readonly mods?: StatBonuses;
}

/** `null` while the fight is ongoing; set exactly once, the instant it ends. */
export interface CombatResult {
  readonly outcome: "won" | "lost";
  readonly warriorHp: number;
  /** Sum of `xpForSolve(grade)` per CORRECT `submitAnswer` this fight (M4a) — a wrong answer
   * earns 0, regardless of action. */
  readonly xpEarned: number;
  /** M4c: per-topic `{correct, attempts}` over the WHOLE fight — `sim-bootstrap.ts` folds this
   * into the persistent `MasteryStore` on EVERY fight end (win or loss). A skip adds no attempt;
   * a wrong-then-requeued-then-correct solve of the SAME problem counts as 2 attempts / 1 correct
   * for that problem's topic (see the module doc). */
  readonly topicOutcomes: Record<MathTopic, TopicMastery>;
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
  /** M4b: applies `kind`'s effect to the CURRENT pending problem while `"await_answer"`. Returns
   * `true` iff a state change actually happened (so the run driver knows whether to spend a
   * charge) — `false` (no-op) when off-phase, when `fifty` targets a typed problem, or when
   * `hint`/`fifty` was already applied to THIS problem (idempotent per problem). See the module
   * doc for the exact per-kind logic. */
  useLifeline(kind: LifelineKind): boolean;
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
  /** Running total of `xpForSolve(grade)` over every CORRECT `submitAnswer` this fight (M4a). */
  xpEarned: number;
  /** M4b: the CURRENT pending problem's worked step, revealed by a "hint" lifeline. Reset to
   * `null` whenever a NEW problem is set (`chooseAction`) — see the module doc. */
  hintText: string | null;
  /** M4b: the non-answer choice index(es) a "fifty" lifeline disabled for the CURRENT pending
   * choice problem; `null` until used, reset to `null` whenever a NEW problem is set. */
  fiftyDisabled: number[] | null;
  /** M4c: running per-topic `{correct, attempts}` tally over the WHOLE fight — see the module doc
   * + `CombatResult.topicOutcomes`. Only `submitAnswer` ever writes to this. */
  topicOutcomes: Record<MathTopic, TopicMastery>;
}

/** Narrows a `Problem` (which carries the answer) down to its boundary-safe `ProblemView` — the
 * ONE place this happens. Never spread a `Problem` directly onto a snapshot. `disabledChoices`
 * (M4b) is only meaningful for the choice branch — a typed problem has no such field. */
function toProblemView(problem: Problem, disabledChoices: readonly number[]): ProblemView {
  return problem.kind === "typed"
    ? { kind: "typed", topic: problem.topic, grade: problem.grade, prompt: problem.prompt }
    : {
        kind: "choice",
        topic: problem.topic,
        grade: problem.grade,
        prompt: problem.prompt,
        choices: problem.choices,
        disabledChoices,
      };
}

export function createCombat(opts: CombatOpts): Combat {
  const { rng, grade, warriorMaxHp, enemy } = opts;
  const mods: StatBonuses = opts.mods ?? ZERO_STATS;

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
    xpEarned: 0,
    hintText: null,
    fiftyDisabled: null,
    topicOutcomes: zeroTopicOutcomes(),
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
        const damage = ATTACK_DAMAGE + mods.atk;
        state.enemyHp = Math.max(0, state.enemyHp - damage);
        return damage;
      }
      case "heal": {
        const before = state.warriorHp;
        state.warriorHp = Math.min(warriorMaxHp, state.warriorHp + HEAL_AMOUNT + mods.heal);
        return state.warriorHp - before;
      }
      case "shield": {
        state.warriorBlock = SHIELD_BLOCK + mods.block;
        return state.warriorBlock;
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
    // M4b: a fresh problem starts with no lifeline applied yet, even if the PREVIOUS problem had
    // one (a re-queued problem after a wrong answer is a genuinely new `nextProblem()` call here).
    state.hintText = null;
    state.fiftyDisabled = null;
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

    // M4c: record this solve's outcome for its topic — BEFORE clearing pendingAction/pendingProblem
    // below. A wrong answer still counts as an ATTEMPT (just not a correct one); a later requeue
    // of this SAME problem (on a subsequent turn) is a SEPARATE `submitAnswer` call, so it adds its
    // own attempt too — exactly the "2 attempts / 1 correct" shape the module doc describes.
    const priorOutcome = state.topicOutcomes[problem.topic];
    state.topicOutcomes = {
      ...state.topicOutcomes,
      [problem.topic]: { correct: priorOutcome.correct + (correct ? 1 : 0), attempts: priorOutcome.attempts + 1 },
    };

    state.pendingAction = null;

    if (correct) {
      state.xpEarned += xpForSolve(grade);
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

  /** M4b — see the `Combat.useLifeline` doc + the module doc for the per-kind rules; the run
   * driver (`sim-bootstrap.ts`) only spends a charge when this returns `true`. */
  function useLifeline(kind: LifelineKind): boolean {
    switch (kind) {
      case "hint": {
        if (state.phase !== "await_answer" || state.pendingProblem === null) return false;
        if (state.hintText !== null) return false; // already hinted this problem
        state.hintText = state.pendingProblem.teach;
        return true;
      }
      case "fifty": {
        if (state.phase !== "await_answer" || state.pendingProblem === null) return false;
        const problem = state.pendingProblem;
        if (problem.kind !== "choice") return false; // no-op on a typed problem
        if (state.fiftyDisabled !== null) return false; // already used this problem
        const wrongIndices = problem.choices
          .map((_, i) => i)
          .filter((i) => i !== problem.answerIndex);
        // Comparison always emits exactly 3 choices (1 answer + 2 wrong) — dropping exactly one
        // wrong index leaves the correct one + one wrong one, a true 50-50. A hypothetical topic
        // with MORE choices would need `count - 2` drops to keep this a true 50-50; not needed
        // today (see the brief).
        const disabledIndex = rng.fork("fifty").pick(wrongIndices);
        state.fiftyDisabled = [disabledIndex];
        return true;
      }
      case "skip": {
        if (state.phase !== "await_answer" || state.pendingAction === null || state.pendingProblem === null) {
          return false;
        }
        const action = state.pendingAction;
        // Reuse the exact correct-branch effect sequencing (applyAction -> "landed" -> won/enemy
        // turn), minus the xpEarned accrual — a skip was not SOLVED, so it earns 0 xp.
        const amount = applyAction(action);
        state.lastPlayer = { kind: "landed", action, amount };
        state.pendingAction = null;
        state.pendingProblem = null;
        state.hintText = null;
        state.fiftyDisabled = null;

        if (state.enemyHp <= 0) {
          state.phase = "won";
          state.turn += 1;
          return true;
        }

        runEnemyTurn();
        return true;
      }
    }
  }

  function snapshot(): CombatSnapshot {
    const enemyView: EnemyView = {
      hp: state.enemyHp,
      maxHp: enemy.maxHp,
      block: 0, // the enemy never blocks
      name: enemy.name,
      title: enemy.title, // M5 folklore theming — copied straight from the archetype
      sprite: enemy.sprite, // M5 slice 3 — creature-art id, drawn client-side (ui/sprites.ts)
      intent: state.enemyIntent,
    };
    return {
      phase: state.phase,
      warrior: { hp: state.warriorHp, maxHp: warriorMaxHp, block: state.warriorBlock },
      enemy: enemyView,
      // Load-bearing: only the display-safe `ProblemView` crosses this boundary.
      problem:
        state.pendingProblem !== null ? toProblemView(state.pendingProblem, state.fiftyDisabled ?? []) : null,
      grade,
      teach: state.teach,
      hint: state.hintText,
      turn: state.turn,
      lastPlayer: state.lastPlayer,
      lastEnemy: state.lastEnemy,
    };
  }

  function result(): CombatResult | null {
    if (state.phase === "won" || state.phase === "lost") {
      return {
        outcome: state.phase,
        warriorHp: state.warriorHp,
        xpEarned: state.xpEarned,
        topicOutcomes: state.topicOutcomes,
      };
    }
    return null;
  }

  return { chooseAction, submitAnswer, acknowledgeTeach, useLifeline, snapshot, result };
}
