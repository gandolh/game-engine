import type { SimContext, System, World } from "@engine/core";
import type { GameEntity } from "../components";
import { ONT_SIMULATION } from "../protocols";

export class CropGrowthSystem implements System {
  readonly name = "CropGrowthSystem";
  private lastDayProcessed = -1;

  constructor(private readonly world: World<GameEntity>) {}

  run(_ctx: SimContext): void {
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

    // Read current weather multiplier from the WeatherStation singleton
    let weatherMultiplier = 1.0;
    for (const station of stations) {
      weatherMultiplier = station.weatherStation.multiplier;
      break;
    }

    // Iterate plots in entity id order for determinism
    const plots = [...this.world.query("plot")];
    plots.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

    for (const plotEntity of plots) {
      const state = plotEntity.plot.state;
      if (state.kind !== "planted") continue;
      state.daysGrowing += 1;
      state.weatherSum += weatherMultiplier;
    }
  }
}
