/**
 * MateQuest M3 — enemy archetypes (corpus/todos/2026-07-22-mathquest-M3-map-and-runs.md, Part
 * A2). SUPERSEDES the M1/M2 single hardcoded enemy: which archetype a fight uses now depends on
 * the map node's `type` ("combat" | "elite" | "boss" — `run/map.ts`'s `NodeType` minus `"rest"`,
 * which has no fight at all).
 *
 * Balance here is PROVISIONAL/tunable, per the brief's own note — these three rows are the only
 * place fight difficulty-by-enemy lives, so retuning later touches only this file.
 */
import type { Grade } from "../combat/types";

/** The three node types a fight can happen at (`"rest"` — `run/map.ts`'s `NodeType` — has none). */
export type EnemyKind = "combat" | "elite" | "boss";

/** An enemy's identity + telegraphed-damage range. `intent = intentBase + rng.int(0, intentRoll)`
 * (see `combat/logic.ts`'s `rollEnemyIntent`). */
export interface EnemyArchetype {
  readonly name: string;
  readonly maxHp: number;
  readonly intentBase: number;
  readonly intentRoll: number;
}

/**
 * Registry of the three M3 enemy archetypes, keyed by `EnemyKind`.
 *
 * Retuned DOWN from the brief's own literal example numbers (combat 24/5-8 unchanged; elite
 * 34hp/7-10; boss 44hp/8-11) — those, combined with the OTHER M1/M2-locked numbers this brief
 * keeps fixed (`ATTACK_DAMAGE=8`, and `WARRIOR_MAX_HP=30` fixed BY THIS BRIEF's own A3: "starts
 * full = 30"), are mathematically unwinnable: killing an enemy takes `ceil(maxHp/8)` attacks, and
 * every one of the `ceil(maxHp/8)-1` NON-lethal attacks draws a full, unblockable return hit (see
 * `combat/combat.ts` — a `"shield"`/`"heal"` turn can't ALSO be the attack that turn, so it adds
 * exposure rather than removing it). At the brief's own numbers the elite alone needs 4 non-lethal
 * hits worst-case 4x10=40 damage, and the boss 5 worst-case 5x11=55 — both exceed the fixed 30 HP
 * cap even from full health in an ISOLATED fight, before any other fight in the run has cost
 * anything. Tuned here so each fight's `(hits-1) * intentRange` stays comfortably under 30 with
 * margin left for the OTHER fights along a run (see `run/map.test.ts`/`sim-bootstrap.test.ts`'s
 * "beating the boss" test, which empirically verifies a full run is winnable at these numbers).
 */
export const ENEMY_ARCHETYPES: Record<EnemyKind, EnemyArchetype> = {
  // A baby Zmeu (Romanian-folklore dragon-adjacent creature) — the M1/M2 enemy, unchanged stats.
  combat: { name: "Zmeu pui", maxHp: 24, intentBase: 5, intentRoll: 4 }, // intent 5..8; 3 hits, 2 unavoidable (10-16 dmg)
  // A Balaur (a multi-headed dragon of Romanian folklore) — the branching-map "hard branch" fight.
  elite: { name: "Balaur", maxHp: 26, intentBase: 5, intentRoll: 3 }, // intent 5..7; 4 hits, 3 unavoidable (15-21 dmg)
  // An elder Zmeu — the run's boss, always grade 4.
  boss: { name: "Zmeu bătrân", maxHp: 32, intentBase: 5, intentRoll: 3 }, // intent 5..7; 4 hits, 3 unavoidable (15-21 dmg)
} as const;

/** The boss's fixed fight grade (`run/map.ts`'s `generateMap` also pins the boss node's own
 * `grade` to this — kept as a named constant so the two stay in lockstep). */
export const BOSS_GRADE: Grade = 4;
