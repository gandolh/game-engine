import type { World } from "@engine/core";
import type { GameEntity } from "../components";

/** First entity matching all given components, or undefined. Query iteration is
 *  insertion-stable, so "first" is deterministic. */
export function firstEntity(
  world: World<GameEntity>,
  ...components: (keyof GameEntity)[]
): GameEntity | undefined {
  for (const e of world.query(...components)) return e;
  return undefined;
}

/** Entity whose id matches, among those with all given components, or undefined. */
export function findById(
  world: World<GameEntity>,
  id: number,
  ...components: (keyof GameEntity)[]
): GameEntity | undefined {
  for (const e of world.query(...components)) {
    if (e.id === id) return e;
  }
  return undefined;
}
