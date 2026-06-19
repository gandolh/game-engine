import type { World } from "@engine/core";
import type { GameEntity } from "../../components";
import { scaleAroundNearestIsland, snapPropToLand, regionAt, type RegionDef } from "../regions";

export function fountainTile(bounds: RegionDef["bounds"]): { x: number; y: number } {
  return { x: bounds.minX + 1, y: bounds.minY + 1 };
}

/**
 * Tiles that must stay walkable (plots, home/cottage, fountain, dock anchors,
 * NPC stations). A decorative prop may render here but must NOT emit a solid
 * onto one — that would block a functional tile. With seed-generated islands
 * (brief 93), snapped props can land on these, so the guard is required.
 * setup.ts populates this from forcedCoreTiles + station tiles before placing props.
 */
let RESERVED_SOLID_TILES: ReadonlySet<string> = new Set();
export function setReservedSolidTiles(tiles: ReadonlySet<string>): void {
  RESERVED_SOLID_TILES = tiles;
}
function isReserved(x: number, y: number): boolean {
  return RESERVED_SOLID_TILES.has(`${x},${y}`);
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
    if (p.solid !== false && onLand && !isReserved(x, y)) {
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
  // structure. Ride the footprint RIGIDLY: translate every authored tile by the
  // SAME displacement (taken from the footprint's first tile) so the rect keeps
  // its authored shape instead of ballooning across the whole island (brief 93 —
  // per-tile nearest-island mapping could scatter tiles and fill a farm with
  // solids, severing it). Only emit a solid on actual mask land that isn't a
  // reserved (plot/station/dock/bridge) tile.
  const anchor = tiles[0]!;
  const ridden0 = scaleAroundNearestIsland(anchor);
  const dx = ridden0.x - anchor.x;
  const dy = ridden0.y - anchor.y;
  for (const t of tiles) {
    const x = t.x + dx;
    const y = t.y + dy;
    if (regionAt(x, y) === null) continue; // skip ocean tiles
    if (isReserved(x, y)) continue; // never block a plot/station/dock/bridge tile
    world.spawn({ solid: { isSolid: true, tileX: x, tileY: y } });
  }
}
