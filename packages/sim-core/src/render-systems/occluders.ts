/**
 * render-systems/occluders.ts — dynamic edge occluders (brief 65 follow-up).
 *
 * South-facing island wall bands and the brief-65 cliff faces together form a
 * vertical face whose base sits at the BOTTOM edge of their tile. Baked into
 * the static layer they always rendered under characters (layers 2/4 vs 50),
 * so a farmer standing on a south-coast tile was painted over the parapet and
 * appeared to float on the wall or out over the water. Instead these sprites
 * are pushed into the dynamic queue every frame on the entity layer with
 * `sortY` at the face's base: the painter's y-sort then draws them OVER any
 * character standing behind (north of) the face, while anything genuinely
 * south of the face would still draw on top of it.
 *
 * Render-only — this reuses the same WALLS/CLIFFS geometry the bake consumed,
 * so pathfinding, sim, and determinism are untouched. The cost is small
 * (a few hundred tile sprites, viewport-culled by renderer.push).
 */

import type { Canvas2dRenderer } from "@engine/core";
import { OCCLUDER_WALLS, CLIFFS } from "./geometry";
import { frameToAtlasId } from "./frames";

const TILE = 16;

/** The snapshot entity layer — farmers, NPCs, and landmark structures all push
 *  at 50, and occluders must share their layer so `compareSprite` y-sorts them
 *  against each other rather than by layer alone. */
const ENTITY_LAYER = 50;

/** Push the edge-occluder sprites for this frame. Call once per frame from the
 *  render loop, alongside `pushSnapshotSprites` (order doesn't matter — the
 *  renderer sorts the whole queue in endFrame). Takes just the `push` surface
 *  so tests can pass a recording stub instead of a real canvas renderer. */
export function pushOccluderSprites(renderer: Pick<Canvas2dRenderer, "push">): void {
  // South-facing wall bands: drawn exactly as the static bake did (same tile
  // center, frame, rotation), but depth-keyed at the tile's bottom edge — the
  // base of the face they top.
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

  // Cliff faces (tall islands' skirts, on the ocean tiles below the coast).
  // Characters can only ever overlap them from behind/above (the tiles south
  // of a cliff are ocean), so keying each at its own bottom edge always wins
  // the sort against a character standing on the island.
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
