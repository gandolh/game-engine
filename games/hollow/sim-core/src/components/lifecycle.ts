/**
 * Lifecycle — age + life stage (chunk hollow-05). `stageForAge` is a pure
 * function of `ageTicks` driven by caller-supplied thresholds (not
 * hardcoded constants) so tests can pass shortened thresholds without
 * duplicating the staging logic — see `family/lifecycle-system.ts`, which
 * calls this every tick with the sim's configured (or default,
 * family/constants.ts) thresholds, and `population.ts`, which calls it
 * implicitly by picking a founder's starting age inside the adult band.
 */

export type Stage = "child" | "adult" | "elder";

export interface Lifecycle {
  birthTick: number;
  ageTicks: number;
  stage: Stage;
}

export interface StageThresholds {
  /** Below this age: "child". */
  childAdultTicks: number;
  /** Below this age (and >= childAdultTicks): "adult". At/above: "elder". */
  adultElderTicks: number;
}

export function stageForAge(ageTicks: number, thresholds: StageThresholds): Stage {
  if (ageTicks < thresholds.childAdultTicks) return "child";
  if (ageTicks < thresholds.adultElderTicks) return "adult";
  return "elder";
}
