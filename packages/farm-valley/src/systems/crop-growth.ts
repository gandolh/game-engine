import type { SimContext, System, World, MessageBus } from "@engine/core";
import type { GameEntity } from "../components";
import { PLOT_DECAY_DAYS } from "../components";
import { ONT_SIMULATION, PERFORMATIVE, type CropDeathBody } from "../protocols";

/**
 * brief 29 — a crop dies after this many consecutive dry days. The grace
 * window makes a single missed watering recoverable rather than instantly
 * fatal. `daysSinceWater` is incremented on dry days; once it exceeds this, the
 * plot reverts to empty (the seed is lost).
 */
export const DRY_DEATH_GRACE_DAYS = 2;

export class CropGrowthSystem implements System {
  readonly name = "CropGrowthSystem";
  private lastDayProcessed = -1;

  constructor(
    private readonly world: World<GameEntity>,
    private readonly bus?: MessageBus,
  ) {}

  run(ctx: SimContext): void {
    // Detect day boundary by checking the WeatherStation's inbox for a day-start message.
    // This is the same signal as WeatherSystem uses, so both run on the same tick.
    const stations = this.world.query("weatherStation", "inbox");
    let newDay: number | null = null;
    for (const station of stations) {
      for (const msg of station.inbox.messages) {
        if (msg.ontology === ONT_SIMULATION.DAY_START) {
          const day = (msg.body as { day: number }).day;
          if (day > this.lastDayProcessed) {
            newDay = day;
          }
        }
      }
      break; // Only one WeatherStation singleton
    }

    if (newDay === null) return;
    this.lastDayProcessed = newDay;

    // Read current weather multiplier + condition from the WeatherStation.
    let weatherMultiplier = 1.0;
    let raining = false;
    for (const station of stations) {
      weatherMultiplier = station.weatherStation.multiplier;
      // brief 29 — rain (rainy/storm) auto-waters every plot this day.
      const cond = station.weatherStation.current;
      raining = cond === "rainy" || cond === "storm";
      break;
    }

    // Iterate plots in entity id order for determinism
    const plots = [...this.world.query("plot")];
    plots.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

    for (const plotEntity of plots) {
      const state = plotEntity.plot.state;
      if (state.kind !== "planted") continue;

      // brief 29 — irrigation gate. A plot counts as watered today if an agent
      // watered it (wateredToday) OR it rained. Watered plots grow + reset the
      // dryness clock; dry plots make no progress and accrue dry days; a plot
      // past the grace window withers (reverts to empty, seed lost).
      const wateredToday = state.wateredToday === true || raining;
      if (wateredToday) {
        state.daysSinceWater = 0;
        state.daysGrowing += 1;
        state.weatherSum += weatherMultiplier;
      } else {
        state.daysSinceWater = (state.daysSinceWater ?? 0) + 1;
        if (state.daysSinceWater > DRY_DEATH_GRACE_DAYS) {
          const crop = state.crop;
          const ownerId = plotEntity.plot.ownerId;
          plotEntity.plot.state = { kind: "empty" };
          this.announceDeath(newDay, ownerId, crop, ctx.tick);
          continue;
        }
      }
      // Reset the daily watered flag for the next day (agents must water again).
      state.wateredToday = false;
    }

    // Plot decay: empty plots that haven't been tended in PLOT_DECAY_DAYS days
    // revert to green (entity despawned). Requires a hoe to re-till.
    const toRemove: GameEntity[] = [];
    for (const plotEntity of plots) {
      const state = plotEntity.plot.state;
      if (state.kind !== "empty") continue;
      const days = (state.daysSinceTended ?? 0) + 1;
      if (days > PLOT_DECAY_DAYS) {
        toRemove.push(plotEntity);
      } else {
        state.daysSinceTended = days;
      }
    }
    for (const e of toRemove) {
      this.world.despawn(e);
    }
  }

  private announceDeath(
    day: number,
    ownerId: number,
    crop: CropDeathBody["crop"],
    tick: number,
  ): void {
    if (!this.bus) return;
    const body: CropDeathBody = { day, ownerId, crop };
    this.bus.send(
      {
        performative: PERFORMATIVE.INFORM,
        ontology: ONT_SIMULATION.CROP_DEATH,
        sender: "world",
        recipient: "broadcast",
        body: body as unknown as Record<string, unknown>,
      },
      tick,
    );
  }
}
