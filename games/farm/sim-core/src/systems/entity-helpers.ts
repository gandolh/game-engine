import type { World } from "@engine/core";
import type { GameEntity } from "../components";

export function firstEntity(
  world: World<GameEntity>,
  ...components: (keyof GameEntity)[]
): GameEntity | undefined {
  for (const e of world.query(...components)) return e;
  return undefined;
}

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
