/**
 * Cursor math for streaming chronicle events out of the worker.
 *
 * Lives in its own module so it can be unit-tested without a `self`/Worker
 * global (same reason `./inspect` is a sibling rather than inline).
 *
 * **Why this is not just `events().length`.** The chronicle is a ring buffer
 * (audit-12): once it reaches `CHRONICLE_CAP`, `events().length` stops growing
 * and plateaus. The worker used to compare the live buffer length against a
 * "how many have I posted" counter, which meant that past the cap
 * `length > posted` was permanently false and the worker silently stopped
 * posting chronicle events for the rest of the session — deterministically, on
 * exactly the long generational runs the cap exists to serve.
 *
 * So the cursor counts events **cumulatively captured** (`dropped + live`),
 * which keeps growing forever, and converts that back into an index into the
 * live buffer when slicing.
 */

export interface ChronicleCursor {
  /** Events captured since sim start, including ones since evicted. */
  readonly captured: number;
  /** Index into the CURRENT `events()` array to start slicing from. */
  readonly startIndex: number;
  /** Events that aged out before this consumer ever saw them. */
  readonly missed: number;
}

/**
 * @param liveLength  `chronicle.events().length` right now
 * @param dropped     `chronicle.droppedCount()` right now
 * @param posted      cumulative count this consumer has already posted
 */
export function advanceChronicleCursor(
  liveLength: number,
  dropped: number,
  posted: number,
): ChronicleCursor {
  const captured = dropped + liveLength;
  // Anything already evicted can never be posted. Start from whichever is
  // later: our last post, or the oldest event still retained.
  const from = Math.max(posted, dropped);
  return {
    captured,
    startIndex: Math.min(Math.max(from - dropped, 0), liveLength),
    missed: Math.max(dropped - posted, 0),
  };
}
