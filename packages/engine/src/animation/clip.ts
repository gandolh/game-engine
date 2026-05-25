/**
 * Immutable animation clip data.
 *
 * A clip is a sequence of named atlas frames with per-frame durations.
 * `sampleAt(elapsedMs)` deterministically resolves the elapsed time to a
 * frame, with loop/no-loop semantics.
 */

export interface AnimationFrame {
  /** Atlas frame name to display while this entry is active. */
  readonly frame: string;
  /** Duration of this frame in milliseconds. Must be > 0. */
  readonly durationMs: number;
}

export interface SampledFrame {
  /** The atlas frame name resolved at the sample time. */
  readonly frameName: string;
  /** Number of full loops completed before the current pass. */
  readonly loopsCompleted: number;
  /**
   * True when the clip is non-looping and elapsedMs has reached or exceeded
   * `totalDurationMs`. The clip then holds on the final frame.
   */
  readonly finished: boolean;
}

export class AnimationClip {
  readonly name: string;
  readonly frames: ReadonlyArray<AnimationFrame>;
  readonly loop: boolean;
  readonly totalDurationMs: number;

  constructor(params: {
    name: string;
    frames: ReadonlyArray<AnimationFrame>;
    loop: boolean;
  }) {
    if (params.frames.length === 0) {
      throw new Error(
        `AnimationClip "${params.name}": frames must not be empty`,
      );
    }
    let total = 0;
    for (const f of params.frames) {
      if (!(f.durationMs > 0) || !Number.isFinite(f.durationMs)) {
        throw new Error(
          `AnimationClip "${params.name}": frame "${f.frame}" has non-positive durationMs ${f.durationMs}`,
        );
      }
      total += f.durationMs;
    }
    this.name = params.name;
    this.frames = params.frames;
    this.loop = params.loop;
    this.totalDurationMs = total;
  }

  /**
   * Resolve a frame for a given elapsed time. Pure / deterministic.
   *
   * - `elapsedMs <= 0` returns the first frame, 0 loops, not finished.
   * - For `loop=true`, time wraps modulo `totalDurationMs`.
   * - For `loop=false`, once `elapsedMs >= totalDurationMs` the last frame
   *   is held and `finished=true`.
   */
  sampleAt(elapsedMs: number): SampledFrame {
    const first = this.frames[0]!;
    const last = this.frames[this.frames.length - 1]!;

    if (elapsedMs <= 0) {
      return { frameName: first.frame, loopsCompleted: 0, finished: false };
    }

    if (elapsedMs >= this.totalDurationMs) {
      if (this.loop) {
        const loopsCompleted = Math.floor(elapsedMs / this.totalDurationMs);
        const local = elapsedMs - loopsCompleted * this.totalDurationMs;
        return {
          frameName: this.frameAtLocal(local),
          loopsCompleted,
          finished: false,
        };
      }
      return {
        frameName: last.frame,
        loopsCompleted: 0,
        finished: true,
      };
    }

    return {
      frameName: this.frameAtLocal(elapsedMs),
      loopsCompleted: 0,
      finished: false,
    };
  }

  private frameAtLocal(localMs: number): string {
    // localMs is guaranteed in [0, totalDurationMs)
    let acc = 0;
    for (const f of this.frames) {
      acc += f.durationMs;
      if (localMs < acc) return f.frame;
    }
    // Floating-point safety net; should be unreachable in normal use.
    return this.frames[this.frames.length - 1]!.frame;
  }
}
