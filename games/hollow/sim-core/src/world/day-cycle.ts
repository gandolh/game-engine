/**
 * Hollow M5 "Daily Life" — chunk hollow-14a. A pure, deterministic day-phase
 * clock: `dayPhase(tick, ticksPerDay)` maps a raw sim tick onto a diurnal
 * routine — commute → work → gather → sleep — as FIXED fractions of the day
 * (`DAY_PHASE_BOUNDARIES` below), independent of whatever `ticksPerDay` the
 * run happens to use.
 *
 * This is FOUNDATION ONLY (see corpus/todos/2026-07-17-hollow-14-daily-life.md,
 * "14a"): nothing in sim-core consumes the phase yet — 14b (jobs) and 14c
 * (social re-texture + the hearth) are the consumers. Deliberately does NOT
 * touch `family/constants.ts`'s tick-scale life constants (stage thresholds,
 * hazards, gestation, birth window, density-brake) — those are RAW ticks,
 * independent of `ticksPerDay` by design (see that file's header), so a
 * longer day does not retune the population's bistable dynamics.
 *
 * Pure arithmetic on the tick count only — no `Rng`, no wall-clock reads, no
 * hidden state. Total over its domain: `ticksPerDay <= 0` (or non-finite)
 * clamps to a sane default (`"commute"`, day 0, fraction 0) rather than
 * dividing by zero or returning NaN.
 */

export type DayPhase = "commute" | "work" | "gather" | "sleep";

/** One phase's span as a fraction of the day: `[start, end)` — `start`
 *  inclusive, `end` exclusive (the LAST entry's `end` is 1.0, the day's
 *  own exclusive upper bound). */
export interface DayPhaseBoundary {
  readonly phase: DayPhase;
  readonly start: number;
  readonly end: number;
}

/** Fixed phase boundaries, as fractions of a day — shared by 14a's clock,
 *  14b's job-shift gating, 14c's social/hearth gating, and every test that
 *  needs to assert "which phase is tick X in" without re-deriving the
 *  fractions. Order matters: `dayPhase` walks this list in order and picks
 *  the first boundary whose `end` the current fraction is strictly below
 *  (the last entry catches the `[0.9, 1.0)` tail, including exactly 1.0 were
 *  floating-point error to ever produce it). */
export const DAY_PHASE_BOUNDARIES: readonly DayPhaseBoundary[] = [
  { phase: "commute", start: 0, end: 0.15 },
  { phase: "work", start: 0.15, end: 0.7 },
  { phase: "gather", start: 0.7, end: 0.9 },
  { phase: "sleep", start: 0.9, end: 1 },
];

export interface DayPhaseResult {
  readonly phase: DayPhase;
  /** `floor(tick / ticksPerDay)` — which day-of-run this tick falls on. */
  readonly dayOfRun: number;
  /** How far through the CURRENT phase this tick is, 0..1 (0 at the phase's
   *  own start) — for 14b/14c/14d to interpolate smooth transitions rather
   *  than snapping at a phase boundary. */
  readonly fractionThroughPhase: number;
}

const DEFAULT_RESULT: DayPhaseResult = {
  phase: "commute",
  dayOfRun: 0,
  fractionThroughPhase: 0,
};

/** Pure, deterministic, total: maps a raw sim tick + the run's `ticksPerDay`
 *  onto a `DayPhase` + day-of-run + within-phase progress. Defensive on a
 *  degenerate `ticksPerDay` (`<= 0` or non-finite) — returns `DEFAULT_RESULT`
 *  instead of dividing by zero / propagating NaN. */
export function dayPhase(tick: number, ticksPerDay: number): DayPhaseResult {
  if (!(ticksPerDay > 0) || !Number.isFinite(ticksPerDay)) {
    return DEFAULT_RESULT;
  }

  const dayOfRun = Math.floor(tick / ticksPerDay);
  const tickIntoDay = tick - dayOfRun * ticksPerDay;
  const fractionOfDay = tickIntoDay / ticksPerDay;

  const lastIndex = DAY_PHASE_BOUNDARIES.length - 1;
  for (let i = 0; i <= lastIndex; i++) {
    const boundary = DAY_PHASE_BOUNDARIES[i]!;
    if (fractionOfDay < boundary.end || i === lastIndex) {
      const span = boundary.end - boundary.start;
      const rawFraction = span > 0 ? (fractionOfDay - boundary.start) / span : 0;
      const fractionThroughPhase = Math.min(1, Math.max(0, rawFraction));
      return { phase: boundary.phase, dayOfRun, fractionThroughPhase };
    }
  }

  /* istanbul ignore next -- unreachable: the loop's last-index branch above
   * always matches before falling off the end. */
  return DEFAULT_RESULT;
}
