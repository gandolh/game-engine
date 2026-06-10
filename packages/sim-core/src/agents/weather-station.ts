import { World } from "@engine/core";
import type { MessageBus, Rng } from "@engine/core";
import type { GameEntity } from "../components";
import { WeatherSystem } from "../systems/weather";
import { CropGrowthSystem } from "../systems/crop-growth";
import { ApSystem } from "../systems/ap";

/** Spawn the singleton WeatherStation tag entity (no transform, no sprite). */
export function spawnWeatherStation(world: World<GameEntity>): GameEntity {
  return world.spawn({
    weatherStation: {
      current: "normal",
      multiplier: 1.0,
      season: "spring",
      forecast: [],
    },
    inbox: { messages: [] },
  });
}

/** Create and wire WeatherSystem, CropGrowthSystem, and ApSystem. */
export function setupWeatherFeature(
  world: World<GameEntity>,
  bus: MessageBus,
  rng: Rng,
): {
  weatherSystem: WeatherSystem;
  cropGrowthSystem: CropGrowthSystem;
  apSystem: ApSystem;
} {
  spawnWeatherStation(world);
  const weatherSystem = new WeatherSystem(bus, world, rng);
  const cropGrowthSystem = new CropGrowthSystem(world, bus);
  const apSystem = new ApSystem(world);
  return { weatherSystem, cropGrowthSystem, apSystem };
}
