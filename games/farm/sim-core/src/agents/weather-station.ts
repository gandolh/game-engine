import { World } from "@engine/core";
import type { MessageBus, Rng } from "@engine/core";
import type { GameEntity } from "../components";
import { WeatherSystem } from "../systems/world-time/weather";
import { CropGrowthSystem } from "../systems/farming/crop-growth";
import { ApSystem } from "../systems/economy/ap";

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
