/**
 * MateQuest balance constants. Combat tuning is fixed since M1 — one hardcoded fight (warrior vs
 * "Zmeu pui"), tuned so repeated wrong answers are genuinely lethal (no block/heal ⇒ dead in ~4-5
 * turns). M2 (corpus/todos/2026-07-22-mathquest-M2-problem-generators.md) adds the per-grade
 * operand/product ranges the problem generators (`combat/generators.ts`) draw from.
 */
import type { Grade } from "./types";

/** Warrior's max HP. */
export const WARRIOR_MAX_HP = 30;

/** The M1 enemy's display name — a baby Zmeu (Romanian-folklore dragon-adjacent creature). */
export const ENEMY_NAME = "Zmeu pui";

/** The M1 enemy's max HP. */
export const ENEMY_MAX_HP = 24;

/** Correct "attack" deals this much damage to the enemy. */
export const ATTACK_DAMAGE = 8;

/** Correct "heal" restores this much HP to the warrior (capped at `WARRIOR_MAX_HP`). */
export const HEAL_AMOUNT = 8;

/** Correct "shield" grants this much block (absorbs the next enemy hit, then resets to 0). */
export const SHIELD_BLOCK = 8;

/** Enemy intent (next-turn telegraphed damage) base: `ENEMY_INTENT_BASE + rng.int(0, ENEMY_INTENT_ROLL)`. */
export const ENEMY_INTENT_BASE = 5;

/** Exclusive upper bound of the enemy intent's random roll — `rng.int(0, ENEMY_INTENT_ROLL)` ⇒ 0..3, so intent is 5..8. */
export const ENEMY_INTENT_ROLL = 4;

/** The grade the sim starts in (before any `setGrade` command). */
export const DEFAULT_GRADE: Grade = 1;

/** Inclusive operand bounds a generator draws `a`/`b` from. */
export interface OperandRange {
  readonly min: number;
  readonly max: number;
}

/**
 * addition/subtraction operand range per grade (M2 brief A2): g1: 1–10, g2: 1–100, g3: 10–999
 * (2–3 digit), g4: 100–4999. Each grade's `max` is chosen so `2*max` never exceeds
 * `ADDITION_ANSWER_MAX` — addition's sum is ALWAYS mentally tractable and in-range with no extra
 * clamping in the generator; subtraction's `a >= b` invariant (never negative) holds by
 * construction regardless (`b` is always drawn from `[min, a]`, see `generators.ts`).
 */
export const ADD_SUB_RANGE: Record<Grade, OperandRange> = {
  1: { min: 1, max: 10 },
  2: { min: 1, max: 100 },
  3: { min: 10, max: 999 },
  4: { min: 100, max: 4999 },
};

/** Upper bound every generated `answer` must stay within (grade-4 addition's brief constraint,
 * applied as a structural invariant across all grades via `ADD_SUB_RANGE`'s chosen `max`es). */
export const ADDITION_ANSWER_MAX = 9999;

/** multiplication (grade 2): times-table facts, 1..10 × 1..10. Not valid for grade 1. */
export const MULT_G2_MIN = 1;
export const MULT_G2_MAX = 10;

/** multiplication (grade 3): 2-digit × 1-digit. */
export const MULT_G3_TENS_MIN = 10;
export const MULT_G3_TENS_MAX = 99;
export const MULT_G3_ONES_MIN = 1;
export const MULT_G3_ONES_MAX = 9;

/** multiplication (grade 4): 2-digit × 2-digit, product capped ≤ 9999 (99×99 = 9801). */
export const MULT_G4_MIN = 10;
export const MULT_G4_MAX = 99;
