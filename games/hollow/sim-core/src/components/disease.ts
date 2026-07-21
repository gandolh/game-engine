/**
 * Disease — a per-agent illness contracted from a rotting corpse (chunk
 * hollow-15). Added to a living agent by `mortality/corpse-system.ts` when it
 * lingers in a rotting body's spread radius; managed once per in-game day by
 * `mortality/disease-system.ts`:
 *   - a flat `DISEASE_MORTALITY_PROB_PER_DAY` (0.10) chance to die each day,
 *     REGARDLESS of treatment (routed through the normal death path as cause
 *     `"disease"` — see the disease system + `family/lifecycle-system.ts`);
 *   - otherwise `sickDays` increments, and the agent RECOVERS (component
 *     removed) once `sickDays` reaches its recovery target — `DISEASE_SELF_
 *     RECOVERY_DAYS` (5) on its own, or `DISEASE_MEDIC_RECOVERY_DAYS` (2) once
 *     a medic has `treated` it (see the medic routine in `agents/villager.ts`
 *     + the `treat` care-act in `mortality/care-act-system.ts`).
 *
 * `treated` is a one-way latch (a medic visit only ever helps); nothing here
 * draws any `Rng` (the daily mortality/recovery rolls live in the disease
 * system, which owns the fork).
 */
export interface Disease {
  /** Tick the agent was infected — for chronicle/render ordering. */
  readonly infectedTick: number;
  /** Whole in-game days spent sick so far (incremented on each day boundary
   *  the agent survives) — compared against the recovery target. */
  sickDays: number;
  /** Set true once a medic has treated this agent, dropping its recovery
   *  target from the self-recovery days to the (shorter) medic-recovery days.
   *  One-way (treatment never un-happens). */
  treated: boolean;
}

/** A fresh infection: 0 days sick, untreated. */
export function makeDisease(infectedTick: number): Disease {
  return { infectedTick, sickDays: 0, treated: false };
}
