import type { World } from "@engine/core";
import type { GameEntity } from "../components";

/** Re-export so callers can import from either shopkeeper or market-wall. */
export { spawnShopkeeper } from "./market-wall";

/** Find the single shopkeeper entity in the world, if any. */
export function findShopkeeper(world: World<GameEntity>): GameEntity | undefined {
  for (const e of world.query("shopkeeper", "inbox")) return e;
  return undefined;
}
