import { FixedStepClock } from "./clock";

export interface LoopHandlers {
  onTick(tick: number): void;
  onRender(alpha: number): void;
}

export class GameLoop {
  private rafId: number | null = null;
  private running = false;

  constructor(
    private readonly clock: FixedStepClock,
    private readonly handlers: LoopHandlers,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    const tickFn = (t: number) => this.handlers.onTick(t);
    const frame = (nowMs: number) => {
      if (!this.running) return;
      this.clock.advance(nowMs, tickFn);
      this.handlers.onRender(this.clock.alpha);
      this.rafId = requestAnimationFrame(frame);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}
