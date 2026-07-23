/**
 * MateQuest M4b — math lifelines (corpus/todos/2026-07-23-mathquest-M4b-lifelines.md): three
 * Who-Wants-to-Be-a-Millionaire-style consumables the player spends DURING a fight to get help on
 * the CURRENT pending problem — `hint` (reveal the worked step early), `fifty` (disable one wrong
 * choice on a comparison problem), `skip` (auto-land the pending action for 0 XP). All in-run,
 * resetting on `newRun()` — there is no persistence yet (that's M4c).
 *
 * Charges start from a small tutorial kit (`STARTING_LIFELINES`, 1 of each — demonstrates the
 * feature immediately) and are topped up by loot (`run/loot.ts`'s `Item.lifeline`). The actual
 * effect logic lives in `combat/combat.ts`'s `useLifeline` — this module only owns the charge-kind
 * type + the two canonical starting records (mirrors `run/progression.ts`'s `StatBonuses`/
 * `ZERO_STATS` pattern).
 */

/** The three lifeline kinds — see `combat/combat.ts`'s `useLifeline` for each one's exact effect. */
export type LifelineKind = "hint" | "fifty" | "skip";

export const LIFELINE_KINDS: readonly LifelineKind[] = ["hint", "fifty", "skip"];

/** Remaining-use counts per kind, all in-run (reset on `newRun()`). */
export type LifelineCharges = Record<LifelineKind, number>;

/** The tutorial freebie kit every run starts with — 1 of each. Always SPREAD (`{ ...STARTING_LIFELINES }`)
 * when assigning to run state; never alias this const directly (it would let one run's spends
 * mutate the shared default). */
export const STARTING_LIFELINES: LifelineCharges = { hint: 1, fifty: 1, skip: 1 };

/** All-zero charges — used where a fresh, empty kit is needed (mirrors `progression.ts`'s `ZERO_STATS`). */
export const NO_LIFELINES: LifelineCharges = { hint: 0, fifty: 0, skip: 0 };
