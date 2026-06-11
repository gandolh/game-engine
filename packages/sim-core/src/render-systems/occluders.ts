// Dynamic occluders: south-facing wall + cliff tiles pushed each frame at sortY = tile bottom edge.
import type { Canvas2dRenderer } from "@engine/core";
import { OCCLUDER_WALLS, CLIFFS } from "./geometry";
import { frameToAtlasId } from "./frames";

const TILE = 16;

const ENTITY_LAYER = 50; // shared with characters so compareSprite y-sorts occluders against them

export function pushOccluderSprites(renderer: Pick<Canvas2dRenderer, "push">): void {
  for (const wall of OCCLUDER_WALLS) {
    renderer.push({
      x: wall.tx * TILE + TILE / 2,
      y: wall.ty * TILE + TILE / 2,
      sortY: (wall.ty + 1) * TILE,
      width: TILE,
      height: TILE,
      frame: wall.frame,
      atlasId: frameToAtlasId(wall.frame),
      rotation: wall.rotation,
      layer: ENTITY_LAYER,
      alpha: 1,
    });
  }

  for (const cliff of CLIFFS) {
    renderer.push({
      x: cliff.tx * TILE + TILE / 2,
      y: cliff.ty * TILE + TILE / 2,
      sortY: (cliff.ty + 1) * TILE,
      width: TILE,
      height: TILE,
      frame: cliff.frame,
      atlasId: frameToAtlasId(cliff.frame),
      rotation: 0,
      layer: ENTITY_LAYER,
      alpha: 1,
    });
  }
}
