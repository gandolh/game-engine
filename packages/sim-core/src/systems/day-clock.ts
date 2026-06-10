import type { SimContext, System, MessageBus } from "@engine/core";
import {
  PERFORMATIVE,
  ONT_SIMULATION,
  type DayStartBody,
  type PhaseStartBody,
} from "../protocols";
import { phaseForTick, type DayPhase } from "./day-phase";
import {
  festivalForDay,
  daysUntilFestival as daysUntilFestivalForDay,
  type FestivalDef,
} from "../protocols/festival";

export interface DayClockConfig {
  ticksPerDay: number;
  maxDays: number;
}

export class DayClockSystem implements System {
  readonly name = "DayClockSystem";
  private currentDay = 0;
  private lastBoundary = -1;
  private lastPhase: DayPhase | null = null;

  constructor(
    private readonly bus: MessageBus,
    private readonly config: DayClockConfig,
  ) {}

  get day(): number {
    return this.currentDay;
  }

  get maxDays(): number {
    return this.config.maxDays;
  }

  /**
   * brief 45 — the festival firing on the current day, or null. Pure function of
   * the day index (the calendar fixes festival dates). Lets the UI / observer
   * panel and agents see "today is a festival".
   */
  get festivalToday(): FestivalDef | null {
    return festivalForDay(this.currentDay);
  }

  /** brief 45 — days until the next festival (0 if today is one). */
  get daysUntilFestival(): number {
    return daysUntilFestivalForDay(this.currentDay);
  }

  run(ctx: SimContext): void {
    const boundary = Math.floor(ctx.tick / this.config.ticksPerDay);
    if (boundary !== this.lastBoundary) {
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
      // Force a phase re-emit at every day boundary so a new day always begins
      // with a fresh morning PHASE_START even if the phase label is unchanged.
      this.lastPhase = null;
    }

    // brief 27 — emit PHASE_START at each intra-day phase boundary so agents
    // re-deliberate (work) or sleep (night) across the long day.
    const phase = phaseForTick(ctx.tick, this.config.ticksPerDay);
    if (phase !== this.lastPhase) {
      this.lastPhase = phase;
      const body: PhaseStartBody = { day: this.currentDay, phase };
      this.bus.send(
        {
          performative: PERFORMATIVE.INFORM,
          ontology: ONT_SIMULATION.PHASE_START,
          sender: "world",
          recipient: "broadcast",
          body: body as unknown as Record<string, unknown>,
        },
        ctx.tick,
      );
    }
  }
}
