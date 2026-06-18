import type { System, SimContext } from "@engine/core";

/**
 * Advances the in-game day counter.
 * Day advances when tick % ticksPerDay === 0 (and tick > 0).
 */
export class DayClockSystem implements System {
  readonly name = "DayClockSystem";
  day = 0;

  constructor(private readonly ticksPerDay: number) {}

  run(ctx: SimContext): void {
    if (ctx.tick > 0 && ctx.tick % this.ticksPerDay === 0) {
      this.day++;
    }
  }
}
