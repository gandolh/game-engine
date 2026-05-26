import type { World } from "@engine/core";
import { Canvas2dRenderer } from "@engine/core";
import type { Canvas2dSprite } from "@engine/core";
import type { GameEntity } from "./components";
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  REGIONS,
  regionAt,
  isWalkable,
} from "./world/regions";

const TILE = 16;

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

/**
 * Decide which background frame (if any) a tile gets.
 * - void (non-walkable) → null: emit nothing (the canvas clear color is the void)
 * - walkable && region === null → road tile ("tile/path")
 * - region.id starts with "farm-" → "tile/grass"
 * - region.id === "village" → "tile/dirt" (cobblestone-ish)
 */
function backdropFrame(tx: number, ty: number): string | null {
  if (!isWalkable(tx, ty)) return null;
  const region = regionAt(tx, ty);
  if (region === null) return "tile/path";
  if (region === "village") return "tile/dirt";
  if (region.startsWith("farm-")) return "tile/grass";
  return null;
}

interface FenceTile {
  tx: number;
  ty: number;
  rotation: number;
}

/**
 * Compute fence perimeter tiles for every farm region. Skips any tile whose
 * neighbor (one step outside the farm) is walkable — that's the road-facing
 * gap where the farm meets a road, so we don't visually block the entry.
 *
 * Top/bottom edges → fence-h rotation 0
 * Left/right edges → fence-h rotation 90° (Math.PI / 2)
 */
function computeFences(): readonly FenceTile[] {
  const out: FenceTile[] = [];
  for (const region of REGIONS) {
    if (region.kind !== "farm") continue;
    const { minX, minY, maxX, maxY } = region.bounds;

    // Top edge (ty = minY). Neighbor outside is (tx, minY - 1).
    for (let tx = minX; tx <= maxX; tx++) {
      if (isWalkable(tx, minY - 1)) continue; // road entry — leave open
      out.push({ tx, ty: minY, rotation: 0 });
    }
    // Bottom edge (ty = maxY). Neighbor outside is (tx, maxY + 1).
    for (let tx = minX; tx <= maxX; tx++) {
      if (isWalkable(tx, maxY + 1)) continue;
      out.push({ tx, ty: maxY, rotation: 0 });
    }
    // Left edge (tx = minX). Neighbor outside is (minX - 1, ty). Skip the
    // corners (already drawn by top/bottom passes).
    for (let ty = minY + 1; ty <= maxY - 1; ty++) {
      if (isWalkable(minX - 1, ty)) continue;
      out.push({ tx: minX, ty, rotation: Math.PI / 2 });
    }
    // Right edge (tx = maxX).
    for (let ty = minY + 1; ty <= maxY - 1; ty++) {
      if (isWalkable(maxX + 1, ty)) continue;
      out.push({ tx: maxX, ty, rotation: Math.PI / 2 });
    }
  }
  return out;
}

const FENCES: readonly FenceTile[] = computeFences();

function* iterSceneSprites(world: World<GameEntity>, alpha: number): Generator<LogicalSprite> {
  // Backdrop: one pass over the 40×40 grid. Void tiles emit nothing.
  for (let ty = 0; ty < WORLD_HEIGHT; ty++) {
    for (let tx = 0; tx < WORLD_WIDTH; tx++) {
      const frame = backdropFrame(tx, ty);
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

  // Farm perimeter fences (village gets none).
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

  // Plots: their tile coord lives on plot.tileX/tileY.
  for (const plot of world.query("plot")) {
    const px = plot.plot.tileX * TILE + TILE / 2;
    const py = plot.plot.tileY * TILE + TILE / 2;
    yield {
      x: px,
      y: py,
      width: TILE,
      height: TILE,
      frame: "tile/dirt",
      rotation: 0,
      layer: 2,
      alpha: 1,
    };
    if (plot.plot.state.kind === "planted") {
      const crop = plot.plot.state.crop;
      const days = plot.plot.state.daysGrowing;
      const ready = plot.plot.state.readyAtDay;
      const stage = days >= ready ? "mature" : days > 0 ? "growing" : "seed";
      yield {
        x: px,
        y: py,
        width: TILE,
        height: TILE,
        frame: `crop/${crop}/${stage}`,
        rotation: 0,
        layer: 10,
        alpha: 1,
      };
    }
  }

  // Sprite entities: transform.x/y are tile units; convert to pixels here.
  for (const entity of world.query("sprite", "transform")) {
    const t = entity.transform;
    const tileX = t.prevX + (t.x - t.prevX) * alpha;
    const tileY = t.prevY + (t.y - t.prevY) * alpha;
    const px = tileX * TILE + TILE / 2;
    const py = tileY * TILE + TILE / 2;
    const s = entity.sprite;
    const tint = s.tintRgba >>> 0;
    yield {
      x: px,
      y: py,
      width: TILE,
      height: TILE,
      frame: s.frame,
      rotation: t.rotation,
      layer: s.layer,
      alpha: (tint & 0xff) / 255,
    };
  }
}

export function buildCanvasFrame(
  renderer: Canvas2dRenderer,
  world: World<GameEntity>,
  alpha: number,
): void {
  for (const ls of iterSceneSprites(world, alpha)) {
    const sprite: Canvas2dSprite = {
      x: ls.x,
      y: ls.y,
      width: ls.width,
      height: ls.height,
      frame: ls.frame,
      rotation: ls.rotation,
      layer: ls.layer,
      alpha: ls.alpha,
    };
    renderer.push(sprite);
  }
}
