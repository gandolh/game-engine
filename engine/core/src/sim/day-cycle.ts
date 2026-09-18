/**
 * The in-game day cycle — the shared numeric core, and the one place the day/night polarity is
 * named unambiguously (audit-62).
 *
 * ## Why this module exists
 *
 * Three games each re-derived the same four-line modulo-and-divide, and then defined the day/night
 * curve with **opposite polarity** under names that did not make the difference obvious:
 *
 * ```
 * // Citadel: nightFactorOf      → 1 at midnight
 * (1 + Math.cos(2 * Math.PI * f)) / 2
 * // Hollow:  dayNightFromPhase  → 0 at midnight
 * 0.5 - 0.5 * Math.cos(phase * Math.PI * 2)
 * ```
 *
 * Both were CORRECT for their own call sites — checked, not assumed — but they are complements
 * under names a reader has to squint at. MateQuest and Hollow both explicitly copy Citadel's render
 * idioms, so anyone moving lighting code between games had even odds of picking the wrong sign and
 * producing a world that is brightest at midnight, which reads as a plausible wash in a screenshot.
 * A fourth game would have been a fourth coin flip.
 *
 * So the deliverable here is the NAMING: {@link nightFactor} and {@link daylightFactor} are an
 * explicit complementary pair, each documented by what it equals at midnight and at noon, so a call
 * site cannot silently mean the other one.
 *
 * ## The phase convention
 *
 * `0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset`. This is Citadel's and Hollow's
 * convention (verified against their real use: Citadel's `duskWeight` centres dawn at 0.22 and dusk
 * at 0.78, and Hollow's `sunDir` swings sunrise ~0.25 / sunset ~0.75).
 *
 * **Farm's `dayFraction` is NOT this clock.** Farm's fraction is a WORKDAY phase — 0 is the start of
 * the morning, and night runs from ~0.85 to 1.0 (`phaseForFraction`). It shares only the modulo
 * arithmetic, which is why {@link dayFraction} is separate from the curve functions below rather
 * than bundled with them. Do not pass a Farm day fraction to {@link nightFactor} expecting an
 * astronomical answer.
 */

/**
 * How far through the current in-game day a tick sits, in `[0, 1)`.
 *
 * Handles negative ticks (the double-modulo) and accepts a fractional `tick`, so a
 * render-clock-smoothed value works as well as an integer one.
 *
 * Returns `0` for a degenerate `ticksPerDay <= 0` rather than `NaN`. Two of the three copies this
 * replaces had that guard and Farm's did not, so Farm's divided by zero and returned `NaN` — which
 * then compared `false` against every phase threshold and silently reported "night" forever.
 */
export function dayFraction(tick: number, ticksPerDay: number): number {
  if (!(ticksPerDay > 0)) return 0;
  const into = ((tick % ticksPerDay) + ticksPerDay) % ticksPerDay;
  return into / ticksPerDay;
}

/**
 * Darkness in `[0, 1]`: **1 at midnight** (phase 0 and 1), **0 at noon** (phase 0.5).
 *
 * This is the one to multiply a night tint's alpha by. The exact complement of
 * {@link daylightFactor} — `nightFactor(p) + daylightFactor(p) === 1` for every `p`.
 */
export function nightFactor(phase: number): number {
  const f = (1 + Math.cos(2 * Math.PI * phase)) / 2;
  return f < 0 ? 0 : f > 1 ? 1 : f;
}

/**
 * Daylight in `[0, 1]`: **0 at midnight** (phase 0 and 1), **1 at noon** (phase 0.5).
 *
 * This is the one to drive ambient light or a sun's intensity with. The exact complement of
 * {@link nightFactor}.
 */
export function daylightFactor(phase: number): number {
  return 1 - nightFactor(phase);
}
