export interface ClockConfig {
  readonly tickRateHz: number;
  readonly maxTicksPerFrame?: number;
}

export interface TickFn {
  (tick: number): void;
}

export class FixedStepClock {
  readonly stepMs: number;
  private readonly maxTicks: number;
  private accumulator = 0;
  private currentTick = 0;
  private lastWallMs: number | null = null;

  constructor(config: ClockConfig) {
    if (config.tickRateHz <= 0) throw new Error("tickRateHz must be > 0");
    this.stepMs = 1000 / config.tickRateHz;
    this.maxTicks = config.maxTicksPerFrame ?? 8;
  }

  get tick(): number {
    return this.currentTick;
  }

  get alpha(): number {
    return this.accumulator / this.stepMs;
  }

  advance(nowMs: number, onTick: TickFn): number {
    if (this.lastWallMs === null) {
      this.lastWallMs = nowMs;
      return 0;
    }
    const delta = Math.max(0, nowMs - this.lastWallMs);
    this.lastWallMs = nowMs;
    this.accumulator += delta;

    let ticks = 0;
    while (this.accumulator >= this.stepMs && ticks < this.maxTicks) {
      this.accumulator -= this.stepMs;
      onTick(this.currentTick);
      this.currentTick += 1;
      ticks += 1;
    }

    if (this.accumulator >= this.stepMs) {
      this.accumulator = this.stepMs;
    }
    return ticks;
  }

  reset(tick: number): void {
    this.currentTick = tick;
    this.accumulator = 0;
    this.lastWallMs = null;
  }
}
