import type { World } from "@engine/core";
import type { GameEntity } from "./components";

export function decorateMarketAndShop(world: World<GameEntity>): void {
  for (const e of world.query("marketWall")) {
    e.transform = { x: 144, y: 88, prevX: 144, prevY: 88, rotation: 0 };
    e.sprite = {
      atlasId: "main",
      frame: "structure/market-wall",
      layer: 50,
      tintRgba: 0xffffffff,
    };
  }
  for (const e of world.query("shopkeeper")) {
    e.transform = { x: 176, y: 88, prevX: 176, prevY: 88, rotation: 0 };
    e.sprite = {
      atlasId: "main",
      frame: "structure/shopkeeper",
      layer: 50,
      tintRgba: 0xffffffff,
    };
  }
}
