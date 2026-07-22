/**
 * MateQuest — the enemy-intent generator the combat model forks off of. Kept separate from
 * `sim-bootstrap.ts` so it's trivially unit-testable in isolation and so the bootstrap file only
 * has to worry about STATE (whose turn is it, what's the pending problem), not the math itself.
 *
 * M1's `generateProblem` (the hardcoded `a + b`) is SUPERSEDED by M2's `combat/generators.ts`
 * (`GENERATORS`/`TOPICS_FOR_GRADE`) — the deterministic, grade-scaled problem-generator seam; see
 * corpus/todos/2026-07-22-mathquest-M2-problem-generators.md.
 *
 * Determinism (root CLAUDE.md): consumes ONLY the `Rng` it's handed — never
 * `Math.random()`/`Date.now()`. The caller (`sim-bootstrap.ts`) is responsible for forking a
 * fresh child `Rng` per call via `rng.fork("intent")`, per the M1 brief.
 */
import type { Rng } from "@engine/core";
import { ENEMY_INTENT_BASE, ENEMY_INTENT_ROLL } from "./constants";

/** The enemy's next-turn telegraphed damage: `ENEMY_INTENT_BASE + rng.int(0, ENEMY_INTENT_ROLL)` ⇒ 5..8. */
export function rollEnemyIntent(rng: Rng): number {
  return ENEMY_INTENT_BASE + rng.int(0, ENEMY_INTENT_ROLL);
}
