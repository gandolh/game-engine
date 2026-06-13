import type { World } from "@engine/core";
import type { GameEntity } from "../components";

export { spawnShopkeeper } from "./market-wall";

export function findShopkeeper(world: World<GameEntity>): GameEntity | undefined {
  for (const e of world.query("shopkeeper", "inbox")) return e;
  return undefined;
}
