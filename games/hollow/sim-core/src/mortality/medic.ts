/**
 * Medic daily-capacity bookkeeping (chunk hollow-15) — shared by the medic
 * deliberation routine (agents/villager.ts, which decides whether to seek a
 * patient) and the `treat` care-act (mortality/care-act-system.ts, which
 * authoritatively spends the budget). Both must agree on "how many treatments
 * are left today", so the day-reset logic lives here once.
 *
 * The budget resets lazily: `medicTreatsToday` is only meaningful for the day
 * recorded in `medicTreatDay` (a `dayOfRun` = `floor(tick / ticksPerDay)`); any
 * other day it reads as 0 used. Pure tick arithmetic on `HollowAgent`'s job
 * state — no `Rng`.
 */
import type { HollowEntity } from "../components";
import { MEDIC_MAX_TREATMENTS_PER_DAY } from "./constants";

/** Treatments the medic has left on `dayOfRun` (0 if it isn't a medic / has no
 *  `agent` component). */
export function medicTreatsRemaining(
  agent: HollowEntity,
  dayOfRun: number,
  cap: number = MEDIC_MAX_TREATMENTS_PER_DAY,
): number {
  const a = agent.agent;
  if (!a) return 0;
  const used = a.medicTreatDay === dayOfRun ? a.medicTreatsToday ?? 0 : 0;
  return Math.max(0, cap - used);
}

/** Records one treatment against `dayOfRun`, resetting the counter first if a
 *  new day has begun since the last treatment. */
export function recordMedicTreatment(agent: HollowEntity, dayOfRun: number): void {
  const a = agent.agent;
  if (!a) return;
  if (a.medicTreatDay !== dayOfRun) {
    a.medicTreatDay = dayOfRun;
    a.medicTreatsToday = 0;
  }
  a.medicTreatsToday = (a.medicTreatsToday ?? 0) + 1;
}
