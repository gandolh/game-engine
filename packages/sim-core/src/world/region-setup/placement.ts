import type { World } from "@engine/core";
import type { GameEntity } from "../../components";
import { scaleAroundNearestIsland, snapPropToLand, regionAt, type RegionDef } from "../regions";

export function fountainTile(bounds: RegionDef["bounds"]): { x: number; y: number } {
  return { x: bounds.minX + 1, y: bounds.minY + 1 };
}

export function placeProps(
  world: World<GameEntity>,
  props: ReadonlyArray<{ x: number; y: number; frame: string; solid?: boolean }>,
): void {
  for (const p of props) {
    // Decorative props: snap the SPRITE onto nearest organic-mask land so a
    // carved-out ocean tile never gets a free-floating decoration (props are
    // cosmetic, so snapping is preferred over throwing — see anchors.ts).
    const scaled = scaleAroundNearestIsland({ x: p.x, y: p.y });
    const onLand = regionAt(scaled.x, scaled.y) !== null;
    const { x, y } = snapPropToLand(scaled);
    const entity: GameEntity = {
      transform: { x, y, prevX: x, prevY: y, rotation: 0 },
      sprite: { atlasId: "main", frame: p.frame, layer: 40, tintRgba: 0xffffffff },
    };
    // Only emit a SOLID when the prop's natural (unsnapped) tile was land. A
    // prop that was carved into the ocean had its solid on a non-walkable tile
    // anyway; relocating that solid onto land could block a functional station,
    // so we keep the snapped sprite but drop the solid.
    if (p.solid !== false && onLand) {
      entity.solid = { isSolid: true, tileX: x, tileY: y };
    }
    world.spawn(entity);
  }
}

export function placeFootprint(
  world: World<GameEntity>,
  tiles: ReadonlyArray<{ x: number; y: number }>,
): void {
  if (tiles.length === 0) return;
  // Footprint solids are non-walkable occlusion backing for a decorative
  // structure. Keep the scaled rect (do NOT snap individual tiles — snapping a
  // carved-out corner would balloon the rect onto unrelated tiles, e.g. a work
  // NPC station). Only emit a solid where the tile is actual mask land; ocean
  // tiles in the rect are already non-walkable, so skipping them is harmless.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const t of tiles) {
    const { x, y } = scaleAroundNearestIsland(t);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (regionAt(x, y) === null) continue; // skip ocean tiles in the rect
      world.spawn({ solid: { isSolid: true, tileX: x, tileY: y } });
    }
  }
}
