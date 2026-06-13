
import type { Canvas2dRenderer } from "@engine/core";
import { OCCLUDER_WALLS, CLIFFS, BIG_STRUCTURES, BRIDGES } from "./geometry";
import { frameToAtlasId, seasonalTreeFrame } from "./frames";
import type { Season } from "../protocols/weather";

const TILE = 16;

const BRIDGE_SWAY_AMP = 1.5; 
const BRIDGE_ROPE_SAG = 4;   

function bridgeSway(nowMs: number): number {
  const t = nowMs / 1000;
  const wobble = Math.sin(t * 2.3) * 0.62 + Math.sin(t * 1.07 + 1.7) * 0.38; 
  const breathe = 0.85 + 0.15 * Math.sin(t * 0.37);
  return wobble * breathe * BRIDGE_SWAY_AMP;
}

const ENTITY_LAYER = 50; 

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

export function pushBridgeSprites(renderer: Pick<Canvas2dRenderer, "push">, nowMs: number): void {
  const sway = bridgeSway(nowMs);
  for (const b of BRIDGES) {
    const dx = b.runsVertical ? sway : 0;
    const dy = b.runsVertical ? 0 : sway;
    const x = b.tx * TILE + TILE / 2 + dx;
    const y = b.ty * TILE + TILE / 2 + dy;

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

    renderer.push({
      x, y,
      width: TILE,
      height: TILE,
      frame: "tile/bridge-rail-posts",
      atlasId: frameToAtlasId("tile/bridge-rail-posts"),
      rotation: b.rotation,
      layer: ENTITY_LAYER + 2,
      alpha: 1,
    });

    const sag = BRIDGE_ROPE_SAG * 4 * b.spanT * (1 - b.spanT);
    renderer.push({
      x, y: y + sag,
      width: TILE,
      height: TILE,
      frame: "tile/bridge-rail-rope",
      atlasId: frameToAtlasId("tile/bridge-rail-rope"),
      rotation: b.rotation,
      layer: ENTITY_LAYER + 3,
      alpha: 1,
    });
  }
}

export function pushBuildingSprites(
  renderer: Pick<Canvas2dRenderer, "push" | "pushShadow">,
  season: Season = "spring",
): void {
  for (const b of BIG_STRUCTURES) {

    const frame = seasonalTreeFrame(b.frame, season);

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
      frame,
      atlasId: frameToAtlasId(frame),
      rotation: 0,
      layer: ENTITY_LAYER,
      alpha: 1,
    });
  }
}
