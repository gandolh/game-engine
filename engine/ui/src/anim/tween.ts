import type { EaseFn } from "./easing";
import { linear } from "./easing";

/**
 * `Tween` — a time-driven interpolation from `from` to `to` over `durationMs`.
 *
 * ### Determinism contract
 * Time is **always injected** — `Tween` never calls `Date.now()`, `performance.now()`,
 * or any other wall-clock source. Callers advance the tween by passing an explicit `dt`
 * (milliseconds elapsed since the last frame) to {@link advanceTween}, keeping
 * simulation/replay deterministic and making tests trivially controllable.
 *
 * ### Typical usage
 * ```ts
 * const t = tween({ from: 0, to: 1, durationMs: 300, ease: easeOutCubic });
 * // each frame:
 * const current = advanceTween(t, dt);  // e.g. dt = 16 ms
 * panel.alpha = current;
 * ```
 *
 * The tween is done when `elapsed >= durationMs`; after that, `advanceTween` always
 * returns `to` and no longer mutates state.
 */

export interface TweenOptions {
  /** Starting value. */
  from: number;
  /** Ending value. */
  to: number;
  /** Total duration in milliseconds (injected-time ms). */
  durationMs: number;
  /**
   * Easing function: maps normalized `t ∈ [0,1]` → output `∈ [0,1]`.
   * Defaults to {@link linear}.
   */
  ease?: EaseFn;
}

export interface Tween {
  readonly from: number;
  readonly to: number;
  readonly durationMs: number;
  readonly ease: EaseFn;
  /** Accumulated elapsed time in ms. Mutated by {@link advanceTween}. */
  elapsed: number;
  /** Most-recently computed value. Updated by {@link advanceTween}. */
  value: number;
  /** `true` once `elapsed >= durationMs`. */
  done: boolean;
}

/** Create a new `Tween` at `t=0` (value equals `from`). */
export function tween(opts: TweenOptions): Tween {
  return {
    from: opts.from,
    to: opts.to,
    durationMs: opts.durationMs,
    ease: opts.ease ?? linear,
    elapsed: 0,
    value: opts.from,
    done: false,
  };
}

/**
 * Advance a tween by `dt` milliseconds and return the interpolated value.
 *
 * - If the tween is already done, returns `to` immediately.
 * - After the call, `tw.value` holds the new interpolated value and `tw.done` is
 *   set to `true` if `elapsed >= durationMs`.
 *
 * @param tw  The tween to advance (mutated in place).
 * @param dt  Time elapsed since the last call, in injected-clock milliseconds.
 * @returns   The interpolated value for this frame.
 */
export function advanceTween(tw: Tween, dt: number): number {
  if (tw.done) return tw.to;

  tw.elapsed = Math.min(tw.elapsed + dt, tw.durationMs);
  const t = tw.durationMs > 0 ? tw.elapsed / tw.durationMs : 1;
  const easedT = tw.ease(Math.min(1, Math.max(0, t)));
  tw.value = tw.from + (tw.to - tw.from) * easedT;

  if (tw.elapsed >= tw.durationMs) {
    tw.value = tw.to;
    tw.done = true;
  }

  return tw.value;
}

/**
 * Reset a tween to its initial state (`elapsed=0`, `value=from`, `done=false`).
 * Lets you replay or reverse an animation without allocating a new object.
 */
export function resetTween(tw: Tween): void {
  tw.elapsed = 0;
  tw.value = tw.from;
  tw.done = false;
}
