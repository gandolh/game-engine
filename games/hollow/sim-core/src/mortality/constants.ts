/**
 * Mortality & Care tuning constants — chunk hollow-15. Every dial the death /
 * corpse / disease / medic pipeline pulls from, collected in ONE documented
 * block per the "one derivation, not separately-guessed numbers" convention
 * (economy/constants.ts, jobs/constants.ts, …).
 *
 * ── tick vs day ────────────────────────────────────────────────────────────
 * Unlike `family/constants.ts`'s life constants (deliberately RAW ticks,
 * independent of `ticksPerDay`), hollow-15's timers are expressed in in-game
 * DAYS and converted to ticks against the run's own `ticksPerDay`
 * (`daysToTicks` below), because the user's spec is literally in days ("starve
 * >3 days", "heal in 5 days / 2 with a medic", "10% chance to die per day").
 * The day boundary is `tick % ticksPerDay === 0` (matching `world/day-cycle.ts`'s
 * `dayOfRun = floor(tick / ticksPerDay)`).
 *
 * ── starvation death ───────────────────────────────────────────────────────
 * `STARVATION_DEATH_DAYS = 3`: continuous days at empty food (tracked as
 * `beliefs.data.foodDepletedTicks` by HollowPerceiveSystem) before starvation
 * kills. Replaces family/constants.ts's deliberately-huge 3000-raw-tick
 * default; `sim-bootstrap.ts` derives the tick threshold as
 * `STARVATION_DEATH_DAYS * ticksPerDay` (still overridable via the
 * `starvationDeathTicks` option — the legacy scarcity test passes a large
 * value to keep measuring onset, not death).
 *
 * ── corpse rot ─────────────────────────────────────────────────────────────
 * `CORPSE_ROT_DELAY_DAYS = 2`: an unburied body lies inert for two in-game days
 * (the grace window for a grave-digger to reach + bury it before it becomes a
 * hazard) before it starts `rotting` and spreading disease. Tuned together
 * with the graveyard's distance (world/grid.ts) so a digger's body→graveyard
 * round trip fits inside the window; too short + a far graveyard turned every
 * death into an outbreak.
 *
 * ── disease spread ─────────────────────────────────────────────────────────
 * A rotting, un-carried corpse infects each uninfected living agent within
 * `DISEASE_SPREAD_RADIUS` (2 Chebyshev tiles) at `DISEASE_INFECT_PROB_PER_TICK`
 * (0.008) per tick — a per-tick roll so lingering near a body is what gets you
 * sick, not a single flyby. Deliberately SMALL: combined with the per-illness
 * lethality below, a high infection rate turns every unburied body into a town-
 * wiping plague (measured: a runaway epidemic on poorly-organized seeds), so a
 * body is tuned as a SLOW hazard whose real danger is being left unburied for
 * many days. The town's defense is burial, not immunity.
 *
 * ── disease outcome ────────────────────────────────────────────────────────
 * Each in-game day a sick agent rolls `DISEASE_MORTALITY_PROB_PER_DAY = 0.10`
 * to die (cause "disease"), REGARDLESS of treatment (the user's spec: the 10%
 * "remains" with a medic). A survivor recovers after `DISEASE_SELF_RECOVERY_
 * DAYS = 5` days sick on its own, or `DISEASE_MEDIC_RECOVERY_DAYS = 2` once a
 * medic has treated it. Note the compounded per-illness lethality is steep by
 * design (untreated ≈ 1 - 0.9^5 ≈ 41% chance of death per illness; medic-
 * treated ≈ 1 - 0.9^2 ≈ 19%) — so a medic nearly halves the odds of dying from
 * a given infection, exactly the care value the user asked for. This is why the
 * INFECTION rate has to stay low: the danger per case is already high.
 *
 * ── medic capacity ─────────────────────────────────────────────────────────
 * `MEDIC_MAX_TREATMENTS_PER_DAY = 3`: a medic can treat at most three distinct
 * patients per in-game day (nearest sick+untreated first — see the medic
 * routine in agents/villager.ts), the daily count reset lazily on the day
 * boundary (HollowAgent.medicTreatsToday/medicTreatDay).
 */

// --- starvation death --------------------------------------------------------

export const STARVATION_DEATH_DAYS = 3;

// --- corpse rot --------------------------------------------------------------

export const CORPSE_ROT_DELAY_DAYS = 2;

// --- disease spread ----------------------------------------------------------

export const DISEASE_SPREAD_RADIUS = 2;
export const DISEASE_INFECT_PROB_PER_TICK = 0.008;

// --- disease outcome ---------------------------------------------------------

export const DISEASE_MORTALITY_PROB_PER_DAY = 0.1;
export const DISEASE_SELF_RECOVERY_DAYS = 5;
export const DISEASE_MEDIC_RECOVERY_DAYS = 2;

// --- medic capacity ----------------------------------------------------------

export const MEDIC_MAX_TREATMENTS_PER_DAY = 3;

// --- helpers -----------------------------------------------------------------

/** Convert an in-game-day count to raw ticks against the run's `ticksPerDay`,
 *  rounded to the nearest whole tick. Defensive on a degenerate `ticksPerDay`
 *  (`<= 0`/non-finite) — returns 0 (mirrors `world/day-cycle.ts`'s clamp),
 *  which callers treat as "fires immediately", never NaN. */
export function daysToTicks(days: number, ticksPerDay: number): number {
  if (!(ticksPerDay > 0) || !Number.isFinite(ticksPerDay)) return 0;
  return Math.round(days * ticksPerDay);
}

/** True on an in-game-day boundary (`tick % ticksPerDay === 0`), tick 0
 *  excluded (no day has elapsed yet). Defensive on a degenerate `ticksPerDay`. */
export function isDayBoundary(tick: number, ticksPerDay: number): boolean {
  if (!(ticksPerDay > 0) || !Number.isFinite(ticksPerDay)) return false;
  return tick > 0 && tick % ticksPerDay === 0;
}
