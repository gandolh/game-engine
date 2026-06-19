import { EDG } from "@engine/core/render";
import {
  CAMPFIRE_TILE,
  getRegion,
  CASINO_REGION_ID,
  RING_REGION_ID,
  REGIONS,
  type RegionId,
} from "../world/regions";
import { FORGE_OVEN_TILE } from "./frames";

export interface LightEmitter {

  tx: number;
  ty: number;

  radiusTiles: number;

  color: string;

  intensity: number;
}

const TILE = 16;

function farmhouseWindows(): LightEmitter[] {
  return REGIONS.filter((r) => r.kind === "farm").map((r) => ({

    tx: r.bounds.maxX - 1,
    ty: r.bounds.maxY - 2,
    radiusTiles: 2.2,
    color: EDG.gold,
    intensity: 0.5,
  }));
}

function centerOf(id: RegionId): { x: number; y: number } {
  return getRegion(id).center;
}

export const LIGHT_EMITTERS: readonly LightEmitter[] = (() => {
  const casino = centerOf(CASINO_REGION_ID);
  const ring = centerOf(RING_REGION_ID);
  return [

    { tx: FORGE_OVEN_TILE.x, ty: FORGE_OVEN_TILE.y, radiusTiles: 3.0, color: EDG.orange, intensity: 0.78 },

    { tx: CAMPFIRE_TILE.x, ty: CAMPFIRE_TILE.y, radiusTiles: 3.2, color: EDG.gold, intensity: 0.72 },

    { tx: casino.x, ty: casino.y, radiusTiles: 4.0, color: EDG.cyan, intensity: 0.6 },
    { tx: casino.x + 2, ty: casino.y + 1, radiusTiles: 2.6, color: EDG.mauve, intensity: 0.5 },

    { tx: ring.x, ty: ring.y, radiusTiles: 3.4, color: EDG.yellow, intensity: 0.58 },

    ...farmhouseWindows(),
  ];
})();

export function emitterPx(e: LightEmitter): { x: number; y: number; radiusPx: number } {
  return {
    x: e.tx * TILE + TILE / 2,
    y: e.ty * TILE + TILE / 2,
    radiusPx: e.radiusTiles * TILE,
  };
}
