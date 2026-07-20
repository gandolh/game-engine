/**
 * `time-control.ts` — PURE speed/pacing helpers for the director's time
 * controls (chunk hollow-11b). These are PACING ONLY: nothing here ever
 * touches tick logic — see `worker/sim-worker.ts`'s header for how
 * `SPEED_OPTIONS` maps onto "how many `sim.tick()` calls per `setInterval`
 * fire", which is the only thing speed changes.
 */

/** The four speeds the control bar offers, per the brief. */
export const SPEED_OPTIONS = [1, 2, 4, 8] as const;
export type SpeedMultiplier = (typeof SPEED_OPTIONS)[number];

export function isSpeedMultiplier(n: number): n is SpeedMultiplier {
  return (SPEED_OPTIONS as readonly number[]).includes(n);
}

/**
 * Clamps an arbitrary requested speed to the nearest valid `SPEED_OPTIONS`
 * entry (ties broken toward the SLOWER option) — defends the worker's
 * `"setSpeed"` handler against a malformed/out-of-range multiplier without
 * ever branching on tick logic. A already-valid multiplier passes through
 * unchanged.
 */
export function normalizeSpeedMultiplier(n: number): SpeedMultiplier {
  if (isSpeedMultiplier(n)) return n;
  let best: SpeedMultiplier = SPEED_OPTIONS[0];
  let bestDist = Infinity;
  for (const opt of SPEED_OPTIONS) {
    const d = Math.abs(opt - n);
    if (d < bestDist) {
      bestDist = d;
      best = opt;
    }
  }
  return best;
}

/** The next speed up (or the fastest, if already at the top) — used by the
 *  control bar's speed cycle button. */
export function nextSpeed(current: SpeedMultiplier): SpeedMultiplier {
  const idx = SPEED_OPTIONS.indexOf(current);
  const next = SPEED_OPTIONS[idx + 1];
  return next ?? current;
}
