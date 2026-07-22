/**
 * MateQuest M1 balance constants (corpus/todos/2026-07-21-mathquest-M1-combat-loop.md).
 * Fixed for M1 — one hardcoded fight (warrior vs "Zmeu pui"), tuned so repeated wrong answers
 * are genuinely lethal (no block/heal ⇒ dead in ~4-5 turns).
 */

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

/** Hardcoded M1 problem type: `a + b`, each operand drawn from `[PROBLEM_OPERAND_MIN, PROBLEM_OPERAND_MAX]`. */
export const PROBLEM_OPERAND_MIN = 2;
export const PROBLEM_OPERAND_MAX = 9;
