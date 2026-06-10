import type { World } from "@engine/core";
import type { Canvas2dSprite } from "@engine/core";
import type { GameEntity } from "../components";
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  TOWN_SQUARE,
  regionAt,
  isWalkable,
} from "../world/regions";
import type { Season } from "../protocols/weather";
import {
  FENCES,
  WALLS,
  SHORES,
  BRIDGES,
  CORAL,
  BIG_STRUCTURES,
  BRIDGE_SET,
  CORAL_ALPHA,
  FISHING_STATICS,
  isOccluderWall,
} from "./geometry";
import { SET_PIECES, SET_PIECE_ALPHA } from "./set-pieces";
import { frameToAtlasId } from "./frames";

const TILE = 16;

/** Per-season grass tile variant. Static layer is re-baked on season change. */
const SEASON_GRASS: Record<Season, string> = {
  spring: "tile/grass-spring",
  summer: "tile/grass-summer",
  autumn: "tile/grass-autumn",
  winter: "tile/grass-winter",
};

interface LogicalSprite {
  x: number;
  y: number;
  width: number;
  height: number;
  frame: string;
  rotation: number;
  layer: number;
  alpha: number;
}

/** Background frame for a tile, or null for ocean/bridge tiles (water shows through). */
function backdropFrame(tx: number, ty: number, season: Season = "spring"): string | null {
  const grassFrame = SEASON_GRASS[season];
  if (!isWalkable(tx, ty)) return null;
  const region = regionAt(tx, ty);
  if (region === null) {
    return BRIDGE_SET.has(ty * WORLD_WIDTH + tx) ? null : "tile/path";
  }
  if (region.startsWith("farm-")) return grassFrame;
  if (region === "blacksmith") return "tile/forge-floor";
  if (region === "carpentry") return "tile/carpentry-floor";
  if (region === "forest-north" || region === "forest-south") return grassFrame;
  if (region === "quarry-north" || region === "quarry-south") return "tile/quarry-floor";
  if (region === "mill") return "tile/stone-floor";
  if (region === "well-north" || region === "well-south") return "tile/stone-floor";
  if (region === "mushroom-grove") return "tile/mushroom-floor";
  if (region === "ice-pond") return "tile/ice-floor";
  if (region === "fishing-isle" || region === "fishing-isle-2") return "tile/sand";
  if (region === "shrine") return "tile/shrine-floor";
  if (region === "harbor") return "tile/dock-floor";
  if (region === "heritage-stones") return "tile/heritage-floor-stones";
  if (region === "heritage-ruin") return "tile/heritage-floor-ruin";
  if (region === "heritage-statue") return "tile/heritage-floor-statue";
  if (region === "waterfall") return grassFrame;
  if (region === "camp") return grassFrame;
  if (region === "village") {
    if (tx >= TOWN_SQUARE.minX && tx <= TOWN_SQUARE.maxX &&
        ty >= TOWN_SQUARE.minY && ty <= TOWN_SQUARE.maxY) {
      return "tile/market-floor";
    }
    return "tile/dirt";
  }
  return "tile/dirt"; // fallback for any future region
}

/** Enumerate all static (never-changing) tiles: backdrop, shores, coral, bridges, walls, fences, buildings, plots. */
export function* iterStaticSprites(
  world: World<GameEntity>,
  season: Season = "spring",
): Generator<LogicalSprite> {
  for (let ty = 0; ty < WORLD_HEIGHT; ty++) {
    for (let tx = 0; tx < WORLD_WIDTH; tx++) {
      const frame = backdropFrame(tx, ty, season);
      if (frame === null) continue;
      yield {
        x: tx * TILE + TILE / 2,
        y: ty * TILE + TILE / 2,
        width: TILE,
        height: TILE,
        frame,
        rotation: 0,
        layer: 0,
        alpha: 1,
      };
    }
  }

  for (const shore of SHORES) {
    yield {
      x: shore.tx * TILE + TILE / 2,
      y: shore.ty * TILE + TILE / 2,
      width: TILE,
      height: TILE,
      frame: "tile/shore",
      rotation: shore.rotation,
      layer: 1,
      alpha: 1,
    };
  }

  for (const coral of CORAL) {
    yield {
      x: coral.tx * TILE + TILE / 2,
      y: coral.ty * TILE + TILE / 2,
      width: TILE,
      height: TILE,
      frame: coral.frame,
      rotation: coral.rotation,
      layer: 2,
      alpha: CORAL_ALPHA,
    };
  }

  for (const piece of SET_PIECES) {
    yield {
      x: piece.tx * TILE + TILE / 2,
      y: piece.ty * TILE + TILE / 2,
      width: TILE,
      height: TILE,
      frame: piece.frame,
      rotation: piece.rotation,
      layer: 2,
      alpha: SET_PIECE_ALPHA,
    };
  }

  // Cliff skirts NOT baked: they depth-sort against characters → see occluders.ts.
  for (const bridge of BRIDGES) {
    yield {
      x: bridge.tx * TILE + TILE / 2,
      y: bridge.ty * TILE + TILE / 2,
      width: TILE,
      height: TILE,
      frame: "tile/bridge-h",
      rotation: bridge.rotation,
      layer: 3,
      alpha: 1,
    };
  }

  // South-facing walls skipped (depth-sort → occluders.ts).
  for (const wall of WALLS) {
    if (isOccluderWall(wall)) continue;
    yield {
      x: wall.tx * TILE + TILE / 2,
      y: wall.ty * TILE + TILE / 2,
      width: TILE,
      height: TILE,
      frame: wall.frame,
      rotation: wall.rotation,
      layer: 4,
      alpha: 1,
    };
  }

  for (const fence of FENCES) {
    yield {
      x: fence.tx * TILE + TILE / 2,
      y: fence.ty * TILE + TILE / 2,
      width: TILE,
      height: TILE,
      frame: "tile/fence-h",
      rotation: fence.rotation,
      layer: 20,
      alpha: 1,
    };
  }

  // Big buildings: bottom-anchored at baseTileY; center offset so bottom edge = base tile bottom.
  for (const b of BIG_STRUCTURES) {
    yield {
      x: b.baseTileX * TILE + b.wPx / 2,
      y: b.baseTileY * TILE + TILE - b.hPx / 2,
      width: b.wPx,
      height: b.hPx,
      frame: b.frame,
      rotation: 0,
      layer: 5,
      alpha: 1,
    };
  }

  for (const fs of FISHING_STATICS) {
    const isBoat = fs.frame === "structure/boat";
    yield {
      x: fs.tx * TILE + TILE / 2,
      y: fs.ty * TILE + TILE / 2,
      width: TILE,
      height: TILE,
      frame: fs.frame,
      rotation: 0,
      layer: isBoat ? 6 : 2,
      alpha: 1,
    };
  }

  for (const plot of world.query("plot")) {
    yield {
      x: plot.plot.tileX * TILE + TILE / 2,
      y: plot.plot.tileY * TILE + TILE / 2,
      width: TILE,
      height: TILE,
      frame: "tile/dirt",
      rotation: 0,
      layer: 2,
      alpha: 1,
    };
  }
}

/** Materialize the static backdrop sprites for a one-time bake (or a season re-bake). */
export function buildStaticLayerSprites(
  world: World<GameEntity>,
  season: Season = "spring",
): Canvas2dSprite[] {
  const out: Canvas2dSprite[] = [];
  for (const ls of iterStaticSprites(world, season)) {
    out.push({
      x: ls.x,
      y: ls.y,
      width: ls.width,
      height: ls.height,
      frame: ls.frame,
      atlasId: frameToAtlasId(ls.frame),
      rotation: ls.rotation,
      layer: ls.layer,
      alpha: ls.alpha,
    });
  }
  return out;
}

