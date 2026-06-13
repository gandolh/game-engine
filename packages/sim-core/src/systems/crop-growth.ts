import type { SimContext, System, World, MessageBus, With } from "@engine/core";
import type { GameEntity } from "../components";
import { PLOT_DECAY_DAYS } from "../components";
import { ONT_SIMULATION, PERFORMATIVE, type CropDeathBody } from "../protocols";
import { seasonForDay } from "../protocols/weather";
import { CROP_SEASON, OUT_OF_SEASON_GROWTH_RATE } from "../economy";
import { farmingGrowthMultiplier } from "./skills";

export const DRY_DEATH_GRACE_DAYS = 2;

export class CropGrowthSystem implements System {
  readonly name = "CropGrowthSystem";
  private lastDayProcessed = -1;
  private readonly plotScratch: With<GameEntity, "plot">[] = [];

  constructor(
    private readonly world: World<GameEntity>,
    private readonly bus?: MessageBus,
  ) {}

  run(ctx: SimContext): void {
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
      break; 
    }

    if (newDay === null) return;
    this.lastDayProcessed = newDay;

    let weatherMultiplier = 1.0;
    let raining = false;
    for (const station of stations) {
      weatherMultiplier = station.weatherStation.multiplier;

      const cond = station.weatherStation.current;
      raining = cond === "rainy" || cond === "storm";
      break;
    }

    const farmingXpByOwner = new Map<number, number>();
    for (const f of this.world.query("farmer")) {
      if (f.id !== undefined) farmingXpByOwner.set(f.id, f.skills?.farming ?? 0);
    }

    const plots = this.plotScratch;
    plots.length = 0;
    for (const p of this.world.query("plot")) plots.push(p);
    plots.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

    for (const plotEntity of plots) {
      const state = plotEntity.plot.state;
      if (state.kind !== "planted") continue;

      const wateredToday = state.wateredToday === true || raining;
      if (wateredToday) {
        state.daysSinceWater = 0;

        const currentSeason = seasonForDay(newDay);
        const cropSeason = CROP_SEASON[state.crop];

        const inGreenhouse = plotEntity.plot.greenhouse === true;
        const seasonMultiplier = inGreenhouse || currentSeason === cropSeason
          ? 1.0
          : OUT_OF_SEASON_GROWTH_RATE;
        const skillMultiplier = farmingGrowthMultiplier(farmingXpByOwner.get(plotEntity.plot.ownerId) ?? 0);
        state.daysGrowing += seasonMultiplier * skillMultiplier;
        state.weatherSum += weatherMultiplier;
      } else {
        state.daysSinceWater = (state.daysSinceWater ?? 0) + 1;
        if (state.daysSinceWater > DRY_DEATH_GRACE_DAYS) {
          const crop = state.crop;
          const ownerId = plotEntity.plot.ownerId;
          plotEntity.plot.state = { kind: "empty", daysSinceTended: 0 };
          this.announceDeath(newDay, ownerId, crop, ctx.tick);
          continue;
        }
      }
      state.wateredToday = false;
    }

    const toRemove: GameEntity[] = [];
    for (const plotEntity of plots) {
      const state = plotEntity.plot.state;
      if (state.kind !== "empty") continue;

      if (plotEntity.plot.greenhouse === true) continue;
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
