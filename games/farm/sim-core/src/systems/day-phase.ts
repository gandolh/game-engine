

import { dayFraction as engineDayFraction } from "@engine/core/sim";

export type DayPhase = "morning" | "work" | "evening" | "night";

const MORNING_END = 0.15;
const WORK_END = 0.65;
const EVENING_END = 0.85;

/**
 * How far through the current in-game day `tick` sits, in `[0, 1)`.
 *
 * NOTE THE CONVENTION (audit-62): Farm's day fraction is a **workday** phase — `0` is the start of
 * the morning and night runs from `EVENING_END` to 1 (see `phaseForFraction`). It is NOT the
 * astronomical `0 = midnight` clock that `@engine/core/sim`'s `nightFactor`/`daylightFactor` are
 * defined against, which Citadel's and Hollow's washes use. The two share only the modulo
 * arithmetic, which is why this re-exports the shared `dayFraction` but nothing else from that
 * module.
 *
 * Behaviour change from the previous local copy: a degenerate `ticksPerDay <= 0` now yields `0`
 * instead of `NaN`. `NaN` compared `false` against every threshold below, so it silently reported
 * "night" forever. Unreachable in practice — every caller is bounded (`@farm/server`'s
 * `INIT_BOUNDS`, `run-descriptor`'s `RUN_BOUNDS`) — but a defined answer beats a quiet lie.
 */
export function dayFraction(tick: number, ticksPerDay: number): number {
  return engineDayFraction(tick, ticksPerDay);
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

export function isActivePhase(phase: DayPhase): boolean {
  return phase === "morning" || phase === "work" || phase === "evening";
}

export function isNightPhase(phase: DayPhase): boolean {
  return phase === "night";
}
