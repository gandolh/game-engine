

export type DayPhase = "morning" | "work" | "evening" | "night";

const MORNING_END = 0.15;
const WORK_END = 0.65;
const EVENING_END = 0.85;

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

export function isActivePhase(phase: DayPhase): boolean {
  return phase === "morning" || phase === "work" || phase === "evening";
}

export function isNightPhase(phase: DayPhase): boolean {
  return phase === "night";
}
