/**
 * MateQuest M1 — the combat model's exported type contract, verbatim from the M1 brief
 * (corpus/todos/2026-07-21-mathquest-M1-combat-loop.md).
 *
 * `CombatSnapshot` is the sim/render boundary (root CLAUDE.md): it is the ONLY thing the worker
 * ever posts to the main thread, and it deliberately carries `prompt` (the problem's display
 * text) but NEVER the `Problem.answer` — the client must never be able to read the answer off
 * the wire. `Problem` (which DOES carry `answer`) is an internal sim-core type; see
 * `sim-bootstrap.ts` for where it's kept private to the booted sim's closure.
 */

/** The three actions the player may choose in `await_action`. */
export type CombatAction = "attack" | "heal" | "shield";

/** The combat state machine's phase. Transitions happen ONLY inside `chooseAction`/`submitAnswer`. */
export type CombatPhase = "await_action" | "await_answer" | "won" | "lost";

/**
 * A math problem. `answer` is INTERNAL to sim-core — never copied onto a `CombatSnapshot`.
 * Only `prompt` (the display text) crosses the sim/render boundary.
 */
export interface Problem {
  readonly prompt: string;
  readonly answer: number;
}

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
 * What happened most recently, for the client's result cue. `"none"` before the first turn
 * resolves. `"landed"`/`"fizzle"` describe the PLAYER's action outcome; `"enemy_hit"` describes
 * the enemy's turn (which — when the fight doesn't end on the player's action — is the last thing
 * that happens before the snapshot returns to `await_action`, so it is the more commonly observed
 * kind; see sim-bootstrap.ts's `submitAnswer` for the exact sequencing).
 */
export type LastResult =
  | { kind: "none" }
  | { kind: "landed"; action: CombatAction; amount: number } // hit/heal/shield succeeded
  | { kind: "fizzle"; action: CombatAction } // wrong answer
  | { kind: "enemy_hit"; amount: number; blocked: number };

/** The data-only sim/render boundary snapshot for MateQuest M1 combat. */
export interface CombatSnapshot {
  readonly phase: CombatPhase;
  readonly warrior: CombatantView;
  readonly enemy: EnemyView;
  /** The problem text while in `await_answer`, else `null`. NEVER the raw answer. */
  readonly prompt: string | null;
  readonly turn: number;
  readonly last: LastResult;
}
