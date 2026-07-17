/**
 * Pacing — the tick↔day denomination baseline for Citadel.
 *
 * Citadel's tunable rates come in three shapes:
 *   1. Per-DAY rates: gated on the day boundary (`ctx.tick % ticksPerDay === 0`)
 *      or expressed in days × `state.ticksPerDay` (fire ignition, disease onset,
 *      immigration, needs/happiness, trader, the raid SCHEDULE). These are already
 *      invariant to `ticksPerDay` — nothing to do here.
 *   2. Movement: villagers step one tile per tick (unchanged — see VillagerSystem).
 *      Raising `ticksPerDay` means villagers cover MORE tiles per day, which is
 *      intentional (they reach work/store comfortably within a day).
 *   3. Per-TICK durations authored against a FIXED baseline of 20 ticks/day: the
 *      production cycle length, the villager work dwell, the fire burn-out, and the
 *      raider/army march interval. These are NOT invariant — at a higher
 *      `ticksPerDay` a "10-tick cycle" would fire far more often per day. They must
 *      be re-denominated so per-DAY outcomes stay fixed.
 *
 * `scaleTicks` re-denominates a shape-3 constant. At `ticksPerDay === BASELINE`
 * (the value every headless run + test uses) the factor is exactly 1, so the whole
 * simulation is byte-identical to before this change — the determinism baseline is
 * untouched. The browser client raises `ticksPerDay` so an in-game day lasts as
 * long as Farm Valley's (1200 ticks ≈ 60 s at 1×), and every shape-3 constant
 * stretches with it so production/day, burn-out-in-days, and the raider's
 * days-to-cross all hold.
 */

/**
 * The ticks/day the per-tick duration constants (production `ticksPerCycle`,
 * `WORK_TICKS`, `BURN_TICKS`, the raider/army `MOVE_INTERVAL`) were authored
 * against. Every headless run and every test bootstraps at this value, so
 * `scaleTicks` is the identity there and nothing they assert moves.
 */
export const BASELINE_TICKS_PER_DAY = 20;

/**
 * Re-denominate a per-tick duration authored at {@link BASELINE_TICKS_PER_DAY} to
 * the sim's actual `ticksPerDay`, preserving the duration in DAYS. Rounded to a
 * whole tick and floored at 1 (a cycle/dwell/march can never be 0 ticks). Pure and
 * deterministic — a function of two integers, no RNG, no wall-clock.
 *
 * At `ticksPerDay === BASELINE_TICKS_PER_DAY` this returns `baseTicks` unchanged.
 */
export function scaleTicks(baseTicks: number, ticksPerDay: number): number {
  return Math.max(1, Math.round((baseTicks * ticksPerDay) / BASELINE_TICKS_PER_DAY));
}
