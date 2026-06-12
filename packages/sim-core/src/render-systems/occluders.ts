// Dynamic occluders: south-facing wall + cliff tiles pushed each frame at sortY = tile bottom edge.
import type { Canvas2dRenderer } from "@engine/core";
import { OCCLUDER_WALLS, CLIFFS, BIG_STRUCTURES, BRIDGES } from "./geometry";
import { frameToAtlasId } from "./frames";

const TILE = 16;

// Rope-bridge sway: the whole deck drifts laterally (perpendicular to crossing) with one slow shared
// phase, so every plank of a span moves together — no inter-tile tearing. Render-only (wall-clock).
const BRIDGE_SWAY_AMP = 1.3;        // world px
const BRIDGE_SWAY_PERIOD_MS = 2400; // slow

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

/**
 * Big buildings (houses, forge, carpenter, weather-station/antenna), pushed each frame at the entity
 * layer with sortY at the building's south base, so they y-sort against farmers: a farmer NORTH of
 * (behind) a building is occluded by it (and the player x-rays through), while one south of it draws
 * in front. Replaces the old static bake at layer 5, which never occluded entities. Drawing geometry
 * matches the former bake exactly (bottom-anchored), so positions are pixel-identical.
 */
/**
 * Bridges, pushed each frame at layer 3 (under entities/crops/fences) with a slow lateral sway, so
 * the rope deck gently swings. Sway axis follows the span's run direction: a deck that runs N–S
 * (vertical, crossed up–down) sways left–right (x); one that runs E–W (horizontal) sways up–down (y).
 * `runsVertical` is derived from deck extent (not `rotation`, which is 0 for 2-wide vertical spans).
 * One shared phase moves a whole span together → no gaps between planks. Replaces the old static bake.
 */
export function pushBridgeSprites(renderer: Pick<Canvas2dRenderer, "push">, nowMs: number): void {
  const sway = Math.sin((nowMs / BRIDGE_SWAY_PERIOD_MS) * Math.PI * 2) * BRIDGE_SWAY_AMP;
  for (const b of BRIDGES) {
    const dx = b.runsVertical ? sway : 0;
    const dy = b.runsVertical ? 0 : sway;
    const x = b.tx * TILE + TILE / 2 + dx;
    const y = b.ty * TILE + TILE / 2 + dy;
    // Deck under entities/crops/fences (layer 3) — farmers walk on top of it.
    renderer.push({
      x, y,
      width: TILE,
      height: TILE,
      frame: "tile/bridge-h",
      atlasId: frameToAtlasId("tile/bridge-h"),
      rotation: b.rotation,
      layer: 3,
      alpha: 1,
    });
    // Brief 83 item 1 — raised camera-side guard rope ABOVE entities, so a crossing farmer reads as
    // standing behind it (between this rope and the deck's flat far rope). Same sway + rotation as the
    // deck so the rail swings with the planks. Mostly transparent → only the rope/posts paint over.
    renderer.push({
      x, y,
      width: TILE,
      height: TILE,
      frame: "tile/bridge-rail-near",
      atlasId: frameToAtlasId("tile/bridge-rail-near"),
      rotation: b.rotation,
      layer: ENTITY_LAYER + 2,
      alpha: 1,
    });
  }
}

export function pushBuildingSprites(renderer: Pick<Canvas2dRenderer, "push" | "pushShadow">): void {
  for (const b of BIG_STRUCTURES) {
    // Directional cast shadow at the south base — offset toward lower-right (sun from upper-left) and
    // lengthened with the building's height, so taller structures throw a longer shadow → reads as 3D.
    renderer.pushShadow(
      b.baseTileX * TILE + b.wPx / 2 + TILE * 0.3,
      (b.baseTileY + 1) * TILE - TILE * 0.1,
      b.wPx * 0.5 + b.hPx * 0.12,
      TILE * 0.28,
      0.28,
    );
    renderer.push({
      x: b.baseTileX * TILE + b.wPx / 2,
      y: b.baseTileY * TILE + TILE - b.hPx / 2,
      sortY: (b.baseTileY + 1) * TILE,
      width: b.wPx,
      height: b.hPx,
      frame: b.frame,
      atlasId: frameToAtlasId(b.frame),
      rotation: 0,
      layer: ENTITY_LAYER,
      alpha: 1,
    });
  }
}
