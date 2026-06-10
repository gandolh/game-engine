/**
 * sim-worker-skip.ts — pure stop-condition logic for the worker's
 * skip-to-highlight fast-forward (Brief 40).
 *
 * Lives outside sim-worker.ts so it can be unit-tested without spinning up a
 * real Worker (sim-worker.ts registers a `self.onmessage` handler on import).
 */

/**
 * Returns true when a new event with drama ≥ threshold appeared this tick —
 * i.e. when prevLen < curLen AND the newest event's drama meets the bar.
 *
 * @param prevLen   Number of events in the feed BEFORE this tick.
 * @param curLen    Number of events in the feed AFTER this tick.
 * @param newestDrama  Drama score of the newest (last) event after this tick.
 * @param threshold  The drama threshold (e.g. HIGHLIGHT_THRESHOLD = 0.7).
 */
export function shouldStopSkip(
  prevLen: number,
  curLen: number,
  newestDrama: number,
  threshold: number,
): boolean {
  return curLen > prevLen && newestDrama >= threshold;
}

/**
 * Safety cap: stop the skip loop after at most this many days of fast-forward.
 * High-drama events are rare (the main blight is around day 50), so a 30-day
 * cap balances responsiveness against an infinite loop if nothing dramatic
 * happens in the remaining run.
 */
export const SKIP_MAX_DAYS = 30;
