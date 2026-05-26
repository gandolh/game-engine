import type { SimContext, System, MessageBus } from "@engine/core";
import { PERFORMATIVE, ONT_SIMULATION, type DayStartBody } from "../protocols";

export interface DayClockConfig {
  ticksPerDay: number;
  maxDays: number;
}

export class DayClockSystem implements System {
  readonly name = "DayClockSystem";
  private currentDay = 0;
  private lastBoundary = -1;

  constructor(
    private readonly bus: MessageBus,
    private readonly config: DayClockConfig,
  ) {}

  get day(): number {
    return this.currentDay;
  }

  run(ctx: SimContext): void {
    const boundary = Math.floor(ctx.tick / this.config.ticksPerDay);
    if (boundary === this.lastBoundary) return;
    this.lastBoundary = boundary;
    this.currentDay = boundary;
    const daysRemaining = Math.max(0, this.config.maxDays - this.currentDay);
    const body: DayStartBody = { day: this.currentDay, daysRemaining };
    this.bus.send(
      {
        performative: PERFORMATIVE.INFORM,
        ontology: ONT_SIMULATION.DAY_START,
        sender: "world",
        recipient: "broadcast",
        body: body as unknown as Record<string, unknown>,
      },
      ctx.tick,
    );
  }
}
