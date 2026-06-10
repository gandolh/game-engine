import type { World } from "@engine/core";
import type { GameEntity } from "../components";

/**
 * Re-export of the shopkeeper spawner so callers can import from either
 * `agents/shopkeeper` or `agents/market-wall`. The canonical implementation
 * lives in `market-wall.ts` next to `setupMarketShopFeature`.
 */
export { spawnShopkeeper } from "./market-wall";

/**
 * Convenience: find the single shopkeeper entity in the world, if any.
 */
export function findShopkeeper(world: World<GameEntity>): GameEntity | undefined {
  for (const e of world.query("shopkeeper", "inbox")) return e;
  return undefined;
}
