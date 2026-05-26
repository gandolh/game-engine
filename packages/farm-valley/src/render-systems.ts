import type { World } from "@engine/core";
import { Canvas2dRenderer } from "@engine/core";
import type { Canvas2dSprite } from "@engine/core";
import type { GameEntity } from "./components";
import type { MeetIndicatorEntry } from "./systems/meet-indicator";
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
 * Pick the sprite frame for a farmer entity given the current simulation tick.
 * While `farmer.path` is set (traveling), the frame alternates between walk-a
 * and walk-b every 2 ticks (~100ms at 20 Hz). When idle the base personality
 * frame is returned unchanged.
 *
 * Extracted as a top-level helper so concurrent diffs in the sprite loop can
 * merge mechanically without touching this logic.
 */
export function pickFarmerFrame(entity: GameEntity, tick: number): string {
  const farmer = entity.farmer;
  const baseFrame = entity.sprite?.frame ?? "";
  if (!farmer?.path) return baseFrame;
  const suffix = (tick >> 1) & 1 ? "/walk-b" : "/walk-a";
  return baseFrame + suffix;
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

// brief-11: focus-camera — procedural halo ring around the focused farmer's position.
// Emits 4 small rotated fence-h segments around the entity center to form a visible ring.
function* iterateFocusHalo(
  world: World<GameEntity>,
  focusedFarmerId: number,
  alpha: number,
): Generator<LogicalSprite> {
  for (const entity of world.query("sprite", "transform", "farmer")) {
    if (entity.id !== focusedFarmerId) continue;
    const t = entity.transform;
    const tileX = t.prevX + (t.x - t.prevX) * alpha;
    const tileY = t.prevY + (t.y - t.prevY) * alpha;
    const cx = tileX * TILE + TILE / 2;
    const cy = tileY * TILE + TILE / 2;
    const r = TILE * 0.8; // ring radius in px
    // 4 small segments at N/E/S/W
    const offsets: Array<[number, number, number]> = [
      [0, -r, 0],
      [r, 0, Math.PI / 2],
      [0, r, 0],
      [-r, 0, Math.PI / 2],
    ];
    for (const [dx, dy, rot] of offsets) {
      yield {
        x: cx + dx,
        y: cy + dy,
        width: TILE * 0.5,
        height: TILE * 0.5,
        frame: "tile/fence-h",
        rotation: rot,
        layer: 50, // above entities
        alpha: 0.85,
      };
    }
    break;
  }
}

function* iterSceneSprites(
  world: World<GameEntity>,
  alpha: number,
  tick: number,
  focusedFarmerId: number | null = null,
): Generator<LogicalSprite> {
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
    const frame = entity.farmer !== undefined ? pickFarmerFrame(entity, tick) : s.frame;
    yield {
      x: px,
      y: py,
      width: TILE,
      height: TILE,
      frame,
      rotation: t.rotation,
      layer: s.layer,
      alpha: (tint & 0xff) / 255,
    };
  }

  // brief-11: focus-camera — emit halo around focused farmer if one is set
  if (focusedFarmerId !== null) {
    yield* iterateFocusHalo(world, focusedFarmerId, alpha);
  }
}

/**
 * Emit one `indicator/meet` bubble sprite per active MEET indicator,
 * positioned one tile-height above each farmer's current transform.
 *
 * This is a standalone generator so concurrent briefs (focus-camera,
 * walking-animation) can each append to the sprite list without merge
 * conflicts — they each own their own function.
 */
function* iterateMeetIndicators(
  world: World<GameEntity>,
  meetIndicators: readonly MeetIndicatorEntry[],
  alpha: number,
): Generator<LogicalSprite> {
  if (meetIndicators.length === 0) return;

  // Build a map of farmerId → interpolated pixel position.
  const positions = new Map<number, { px: number; py: number }>();
  for (const entity of world.query("transform")) {
    if (entity.id === undefined) continue;
    const t = entity.transform;
    const tileX = t.prevX + (t.x - t.prevX) * alpha;
    const tileY = t.prevY + (t.y - t.prevY) * alpha;
    positions.set(entity.id, {
      px: tileX * TILE + TILE / 2,
      py: tileY * TILE + TILE / 2,
    });
  }

  for (const entry of meetIndicators) {
    const pos = positions.get(entry.farmerId);
    if (!pos) continue;
    yield {
      x: pos.px,
      y: pos.py - TILE, // one tile above the farmer sprite
      width: TILE,
      height: TILE,
      frame: "indicator/meet",
      rotation: 0,
      layer: 90, // above all scene sprites
      alpha: 1,
    };
  }
}

export function buildCanvasFrame(
  renderer: Canvas2dRenderer,
  world: World<GameEntity>,
  alpha: number,
  tick: number,
  meetIndicators: readonly MeetIndicatorEntry[] = [],
  focusedFarmerId: number | null = null,
): void {
  for (const ls of iterSceneSprites(world, alpha, tick, focusedFarmerId)) {
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

  for (const ls of iterateMeetIndicators(world, meetIndicators, alpha)) {
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
