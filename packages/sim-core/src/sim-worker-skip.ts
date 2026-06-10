// Pure stop-condition logic for skip-to-highlight; lives outside sim-worker.ts for unit-testability.

/** True when a new event with drama ≥ threshold appeared this tick. */
export function shouldStopSkip(
  prevLen: number,
  curLen: number,
  newestDrama: number,
  threshold: number,
): boolean {
  return curLen > prevLen && newestDrama >= threshold;
}

/** Safety cap: stop fast-forward after this many days even if no high-drama event fires. */
export const SKIP_MAX_DAYS = 30;
