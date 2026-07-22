/**
 * MateQuest — the enemy-intent generator the combat model forks off of. Kept separate from
 * `combat/combat.ts` so it's trivially unit-testable in isolation and so the combat factory only
 * has to worry about STATE (whose turn is it, what's the pending problem), not the math itself.
 *
 * M1's `generateProblem` (the hardcoded `a + b`) is SUPERSEDED by M2's `combat/generators.ts`
 * (`GENERATORS`/`TOPICS_FOR_GRADE`) — the deterministic, grade-scaled problem-generator seam; see
 * corpus/todos/2026-07-22-mathquest-M2-problem-generators.md.
 *
 * M3 (corpus/todos/2026-07-22-mathquest-M3-map-and-runs.md) generalizes this from the M1/M2
 * single hardcoded enemy to any `EnemyArchetype`'s `intentBase`/`intentRoll` (`run/enemies.ts`) —
 * the caller (`combat/combat.ts`) passes the active fight's archetype's own range.
 *
 * Determinism (root CLAUDE.md): consumes ONLY the `Rng` it's handed — never
 * `Math.random()`/`Date.now()`. The caller is responsible for forking a fresh child `Rng` per
 * call via `rng.fork("intent")`, per the M1 brief.
 */
import type { Rng } from "@engine/core";

/** The enemy's next-turn telegraphed damage: `base + rng.int(0, roll)`. */
export function rollEnemyIntent(rng: Rng, base: number, roll: number): number {
  return base + rng.int(0, roll);
}
