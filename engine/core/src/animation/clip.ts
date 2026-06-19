

export interface AnimationFrame {

  readonly frame: string;

  readonly durationMs: number;
}

export interface AnimationEvent {
  readonly name: string;

  readonly atMs: number;
}

export interface SampledFrame {

  readonly frameName: string;

  readonly loopsCompleted: number;

  readonly finished: boolean;
}

export class AnimationClip {
  readonly name: string;
  readonly frames: ReadonlyArray<AnimationFrame>;
  readonly loop: boolean;
  readonly totalDurationMs: number;
  readonly events: ReadonlyArray<AnimationEvent>;

  constructor(params: {
    name: string;
    frames: ReadonlyArray<AnimationFrame>;
    loop: boolean;
    events?: ReadonlyArray<AnimationEvent>;
  }) {
    if (params.frames.length === 0) {
      throw new Error(`AnimationClip "${params.name}": frames must not be empty`);
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
    const events = params.events ?? [];
    for (const e of events) {
      if (!(e.atMs >= 0) || e.atMs >= total) {
        throw new Error(
          `AnimationClip "${params.name}": event "${e.name}" atMs ${e.atMs} out of [0, ${total})`,
        );
      }
    }
    this.events = events;
  }

  eventsBetween(prevMs: number, curMs: number): string[] {
    if (this.events.length === 0 || curMs <= prevMs) return [];
    const out: string[] = [];
    if (this.loop) {

      const span = Math.min(curMs - prevMs, this.totalDurationMs);
      const from = curMs - span;
      for (const e of this.events) {
        const firstK = Math.ceil((from - e.atMs) / this.totalDurationMs);
        for (let k = firstK; ; k += 1) {
          const t = e.atMs + k * this.totalDurationMs;
          if (t <= from) continue;
          if (t > curMs) break;
          out.push(e.name);
        }
      }
    } else {
      for (const e of this.events) {
        if (e.atMs > prevMs && e.atMs <= curMs) out.push(e.name);
      }
    }
    return out;
  }

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
      return { frameName: last.frame, loopsCompleted: 0, finished: true };
    }

    return { frameName: this.frameAtLocal(elapsedMs), loopsCompleted: 0, finished: false };
  }

  private frameAtLocal(localMs: number): string {

    let acc = 0;
    for (const f of this.frames) {
      acc += f.durationMs;
      if (localMs < acc) return f.frame;
    }

    return this.frames[this.frames.length - 1]!.frame;
  }
}
