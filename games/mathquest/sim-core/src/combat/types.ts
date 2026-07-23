/**
 * MateQuest — the combat model's exported type contract, verbatim from the M1 brief
 * (corpus/todos/2026-07-21-mathquest-M1-combat-loop.md) EXTENDED by the M2 brief
 * (corpus/todos/2026-07-22-mathquest-M2-problem-generators.md) for the deterministic
 * problem-generator seam (grades I–IV, four topics, mixed typed/choice input, teach+re-queue).
 *
 * `CombatSnapshot` is the sim/render boundary (root CLAUDE.md): it is the ONLY thing the worker
 * ever posts to the main thread, and it deliberately carries `problem` as a `ProblemView` (display
 * text + choices only) but NEVER `Problem.answer`/`ChoiceProblem.answerIndex` — the client must
 * never be able to read the answer off the wire. `Problem` (which DOES carry the answer) is an
 * internal sim-core type; see `sim-bootstrap.ts` for where it's kept private to the booted sim's
 * closure and `sim-bootstrap.ts`'s `toProblemView` for the ONE place a `Problem` is narrowed down
 * to a `ProblemView` before crossing the boundary.
 */

/** The three actions the player may choose in `await_action`. */
export type CombatAction = "attack" | "heal" | "shield";

/**
 * The combat state machine's phase. Transitions happen ONLY inside `chooseAction`/`submitAnswer`/
 * `acknowledgeTeach`. `"teach"` (M2) sits between a wrong answer and the enemy's turn: the player
 * sees the worked-step `teach` text BEFORE taking the hit, and must `acknowledgeTeach()` to
 * advance — see `sim-bootstrap.ts`'s module doc for the exact sequencing.
 */
export type CombatPhase = "await_action" | "await_answer" | "teach" | "won" | "lost";

/** Grade I–IV of the Romanian primary-school curriculum. V–VIII are a later milestone. */
export type Grade = 1 | 2 | 3 | 4;

/** The four M2 topics. Word-problems/fractions/geometry are explicitly DEFERRED (see the brief). */
export type MathTopic = "addition" | "subtraction" | "multiplication" | "comparison";

/** Whether a problem is answered via the numeric keypad or by picking one of its `choices`. */
export type ProblemKind = "typed" | "choice";

interface ProblemCommon {
  readonly topic: MathTopic;
  readonly grade: Grade;
  readonly prompt: string;
  /** Short worked-step text shown on a wrong answer's `"teach"` phase. INTERNAL until copied
   * verbatim onto `CombatSnapshot.teach` (which carries no other Problem fields). */
  readonly teach: string;
}

/** A computation problem (addition/subtraction/multiplication), answered via the keypad. */
export interface TypedProblem extends ProblemCommon {
  readonly kind: "typed";
  /** INTERNAL to sim-core — never copied onto a `CombatSnapshot`/`ProblemView`. */
  readonly answer: number;
}

/** A concept problem (comparison), answered by picking one of `choices`. */
export interface ChoiceProblem extends ProblemCommon {
  readonly kind: "choice";
  readonly choices: readonly string[];
  /** INTERNAL to sim-core — never copied onto a `CombatSnapshot`/`ProblemView`. */
  readonly answerIndex: number;
}

/** A math problem. `answer`/`answerIndex` are INTERNAL to sim-core — see `ProblemView`. */
export type Problem = TypedProblem | ChoiceProblem;

/**
 * The sim/render-boundary-safe projection of a `Problem`: identical shape minus the answer
 * fields. `sim-bootstrap.ts`'s `toProblemView` is the ONLY place a `Problem` is narrowed to this.
 */
export type ProblemView =
  | { readonly kind: "typed"; readonly topic: MathTopic; readonly grade: Grade; readonly prompt: string }
  | {
      readonly kind: "choice";
      readonly topic: MathTopic;
      readonly grade: Grade;
      readonly prompt: string;
      readonly choices: readonly string[];
      /** M4b: non-answer indices a "fifty" lifeline disabled — empty when no fifty was used on
       * this problem. NEVER contains the answer index (the non-leak invariant — see the module
       * doc); `toProblemView` fills this from `CombatState.fiftyDisabled ?? []`. */
      readonly disabledChoices: readonly number[];
    };

/** The client's answer to the pending problem, submitted via `submitAnswer`. */
export type AnswerResponse = { readonly kind: "typed"; readonly value: number } | { readonly kind: "choice"; readonly index: number };

/** The renderable state of any combatant (shared shape for warrior + enemy). */
export interface CombatantView {
  readonly hp: number;
  readonly maxHp: number;
  readonly block: number;
}

/** The enemy additionally carries a display name and its telegraphed next-turn intent (damage). */
export interface EnemyView extends CombatantView {
  readonly name: string;
  readonly intent: number;
}

/**
 * What happened on the PLAYER's most recent action, for the client's result cue. `"none"` before
 * the first turn resolves. Kept SEPARATE from `EnemyResult` (M2 fold-in of the M1 known-minor) so
 * the player's own action result is never overwritten by the enemy's hit within the same turn.
 */
export type PlayerResult =
  | { kind: "none" }
  | { kind: "landed"; action: CombatAction; amount: number } // hit/heal/shield succeeded
  | { kind: "fizzle"; action: CombatAction }; // wrong answer

/** What happened on the ENEMY's most recent turn, for the client's SECOND result-cue line. */
export type EnemyResult = { kind: "none" } | { kind: "enemy_hit"; amount: number; blocked: number };

/** The data-only sim/render boundary snapshot for MateQuest combat. */
export interface CombatSnapshot {
  readonly phase: CombatPhase;
  readonly warrior: CombatantView;
  readonly enemy: EnemyView;
  /** The pending problem's display-safe view while in `await_answer`/`teach`, else `null`.
   * NEVER carries `answer`/`answerIndex` — see the module doc. */
  readonly problem: ProblemView | null;
  /** The player-selected difficulty; `setGrade` changes it, future problems use its ranges. */
  readonly grade: Grade;
  /** The worked-step text for the missed problem, non-null ONLY in `"teach"` phase. */
  readonly teach: string | null;
  /** M4b: the worked step for the CURRENT pending problem, revealed by a "hint" lifeline. `null`
   * outside `"await_answer"`, or when no hint has been used on the current problem yet. Distinct
   * from `teach` (which is the POST-mistake worked step shown in `"teach"` phase). */
  readonly hint: string | null;
  readonly turn: number;
  readonly lastPlayer: PlayerResult;
  readonly lastEnemy: EnemyResult;
}
