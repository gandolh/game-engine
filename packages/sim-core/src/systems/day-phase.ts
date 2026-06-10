/**
 * brief 27 — intra-day phases.
 *
 * A day is now long (default 1200 ticks = 1 real minute @ 20Hz; the Stardew
 * target of 6000 = 5 min is selectable via the run hash). Agents no longer act
 * once per day — the day is split into phases, and agents re-deliberate at the
 * start of each WORK phase, reacting to live conditions. The macro-economy
 * (crop growth, weather, seasons, auctions, shock) stays day-denominated — only
 * agent *activity* is intra-day.
 *
 * Phases (as fractions of the day):
 *   morning  [0.00, 0.15)  — wake; first work deliberation fires at its start
 *   work     [0.15, 0.65)  — main activity window; a second work deliberation
 *   evening  [0.65, 0.85)  — head home
 *   night    [0.85, 1.00)  — sleep; no field work. Caught away ⇒ unrested.
 *
 * All pure functions of (tick, ticksPerDay). No randomness, no wall-clock.
 */

export type DayPhase = "morning" | "work" | "evening" | "night";

/** Phase boundaries as cumulative fractions of the day. */
const MORNING_END = 0.15;
const WORK_END = 0.65;
const EVENING_END = 0.85;

/** Position within the current day, in [0, 1). */
export function dayFraction(tick: number, ticksPerDay: number): number {
  const into = ((tick % ticksPerDay) + ticksPerDay) % ticksPerDay;
  return into / ticksPerDay;
}

export function phaseForFraction(f: number): DayPhase {
  if (f < MORNING_END) return "morning";
  if (f < WORK_END) return "work";
  if (f < EVENING_END) return "evening";
  return "night";
}

export function phaseForTick(tick: number, ticksPerDay: number): DayPhase {
  return phaseForFraction(dayFraction(tick, ticksPerDay));
}

/** Phases during which agents deliberate + act on the world (wake + work). */
export function isActivePhase(phase: DayPhase): boolean {
  return phase === "morning" || phase === "work" || phase === "evening";
}

/** The night phase — agents should be home asleep; field work is forbidden. */
export function isNightPhase(phase: DayPhase): boolean {
  return phase === "night";
}
