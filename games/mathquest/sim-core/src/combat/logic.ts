/**
 * MateQuest M1 — the two pure, rng-consuming generators the combat model forks off of. Kept
 * separate from `sim-bootstrap.ts` so they're trivially unit-testable in isolation and so the
 * bootstrap file only has to worry about STATE (whose turn is it, what's the pending problem),
 * not the math itself.
 *
 * Determinism (root CLAUDE.md): both functions consume ONLY the `Rng` they're handed — never
 * `Math.random()`/`Date.now()`. The caller (`sim-bootstrap.ts`) is responsible for forking a
 * fresh child `Rng` per call via `rng.fork("problem")` / `rng.fork("intent")`, per the M1 brief.
 */
import type { Rng } from "@engine/core";
import {
  ENEMY_INTENT_BASE,
  ENEMY_INTENT_ROLL,
  PROBLEM_OPERAND_MAX,
  PROBLEM_OPERAND_MIN,
} from "./constants";
import type { Problem } from "./types";

/**
 * The hardcoded M1 problem type: `a + b`, each operand drawn independently from
 * `[PROBLEM_OPERAND_MIN, PROBLEM_OPERAND_MAX]` inclusive.
 */
export function generateProblem(rng: Rng): Problem {
  const a = rng.int(PROBLEM_OPERAND_MIN, PROBLEM_OPERAND_MAX + 1);
  const b = rng.int(PROBLEM_OPERAND_MIN, PROBLEM_OPERAND_MAX + 1);
  return { prompt: `${a} + ${b} = ?`, answer: a + b };
}

/** The enemy's next-turn telegraphed damage: `ENEMY_INTENT_BASE + rng.int(0, ENEMY_INTENT_ROLL)` ⇒ 5..8. */
export function rollEnemyIntent(rng: Rng): number {
  return ENEMY_INTENT_BASE + rng.int(0, ENEMY_INTENT_ROLL);
}
