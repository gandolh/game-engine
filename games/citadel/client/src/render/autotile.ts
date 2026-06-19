/**
 * Adjacency autotiling for roads & walls (brief 11) — pure, tested.
 *
 * Roads and walls render as connected runs instead of loose squares by
 * computing a 4-neighbour bitmask per tile and drawing a center block plus an
 * "arm" quad toward each connected neighbour. Adjacent tiles' arms meet at the
 * shared edge, so a network visually fuses into straight / L / T / cross /
 * dead-end shapes.
 *
 * Bitmask bit layout (N|E|S|W):
 *   N = 1, E = 2, S = 4, W = 8
 * so e.g. mask 0b0101 = N|S = a vertical straight; 0b0011 = N|E = an L-corner.
 *
 * GATE DECISION: gates count as wall neighbours, so a wall run continues
 * *through* a gate (reads better — the perimeter looks unbroken). Roads do NOT
 * treat gates as road, and walls do NOT treat roads as wall — each network is
 * independent, except walls additionally absorb gate tiles into their set.
 *
 * PERF: masks are recomputed every frame from the building snapshot. The world
 * is <=96×96 and road+wall tiles are a small fraction, well under the brief's
 * ~1000-tile budget, so recompute-per-frame is fine and avoids cache
 * invalidation on placement commands.
 */
import { TILE_SIZE, WORLD_WIDTH } from "@citadel/sim-core";
import type { BuildingSnapshot } from "@citadel/sim-core";
import { packTint, BUILDING_COLORS, FALLBACK_BUILDING_COLOR } from "./quads";
import type { QuadSpec } from "./quads";

/** Direction bits for the 4-neighbour autotile mask. */
export const DIR_N = 1;
export const DIR_E = 2;
export const DIR_S = 4;
export const DIR_W = 8;

/** Road network layer (drawn above terrain, below buildings). */
const LAYER_NETWORK = 5;

/** Road band fraction (thin) and wall band fraction (thick). */
const ROAD_BAND = 0.5;
const WALL_BAND = 0.8;

/** Build a Set of packed tile keys (`ty*WORLD_WIDTH+tx`) for a 1×1 tile list. */
export function tileKey(tx: number, ty: number): number {
  return ty * WORLD_WIDTH + tx;
}

/**
 * Compute the 4-neighbour connectivity mask for the tile (tx,ty) given the set
 * of connected-network tile keys. Pure.
 */
export function neighbourMask(tx: number, ty: number, members: ReadonlySet<number>): number {
  let mask = 0;
  if (members.has(tileKey(tx, ty - 1))) mask |= DIR_N;
  if (members.has(tileKey(tx + 1, ty))) mask |= DIR_E;
  if (members.has(tileKey(tx, ty + 1))) mask |= DIR_S;
  if (members.has(tileKey(tx - 1, ty))) mask |= DIR_W;
  return mask;
}

/**
 * Expand a tile + connectivity mask into autotile quads: a center block plus an
 * arm quad toward each connected neighbour. `band` is the fraction of the tile
 * occupied by the band thickness (roads thinner, walls thicker). Pure — no GPU.
 *
 * The center block is `band`-sized and centered; each arm fills from the center
 * to the tile edge in its direction, at `band` thickness. Two adjacent tiles'
 * arms therefore meet exactly at the shared tile edge and read as fused.
 */
export function autotileQuads(tileX: number, tileY: number, mask: number, hex: string, band: number): QuadSpec[] {
  const tint = packTint(hex);
  const px = tileX * TILE_SIZE;
  const py = tileY * TILE_SIZE;
  const thick = TILE_SIZE * band;
  const off = (TILE_SIZE - thick) / 2; // inset of the band from the tile edge
  const quads: QuadSpec[] = [];

  // Center block — always present (an isolated tile renders as just this).
  quads.push({ x: px + off, y: py + off, width: thick, height: thick, tintRgba: tint });

  // North arm: from the tile's top edge down to the center block top.
  if (mask & DIR_N) {
    quads.push({ x: px + off, y: py, width: thick, height: off, tintRgba: tint });
  }
  // South arm: from the center block bottom down to the tile's bottom edge.
  if (mask & DIR_S) {
    quads.push({ x: px + off, y: py + off + thick, width: thick, height: off, tintRgba: tint });
  }
  // West arm: from the tile's left edge to the center block left.
  if (mask & DIR_W) {
    quads.push({ x: px, y: py + off, width: off, height: thick, tintRgba: tint });
  }
  // East arm: from the center block right to the tile's right edge.
  if (mask & DIR_E) {
    quads.push({ x: px + off + thick, y: py + off, width: off, height: thick, tintRgba: tint });
  }
  return quads;
}

/**
 * Pull road / wall tiles out of the building snapshot, compute connectivity
 * masks, and return the autotile quads for both networks. Gates are added to
 * the wall set (continuous-through-gate) but the gate's own tile keeps its
 * distinct gold draw via `buildingQuad`, so we don't emit wall quads for gate
 * cells themselves — only the wall tiles get autotile quads, computed against a
 * member set that *includes* gates.
 *
 * Returns the quads so `pushNetworks` (and the tests) can consume them. Pure.
 */
export function networkQuads(buildings: readonly BuildingSnapshot[]): QuadSpec[] {
  const roadTiles: Array<{ tx: number; ty: number }> = [];
  const wallTiles: Array<{ tx: number; ty: number }> = [];
  const roadSet = new Set<number>();
  const wallSet = new Set<number>();

  // First pass: build membership sets. Walls + gates both join the wall set so
  // a run continues through a gate; roads are their own set.
  for (const b of buildings) {
    // Footprints can exceed 1×1; key every covered tile.
    for (let dy = 0; dy < b.h; dy++) {
      for (let dx = 0; dx < b.w; dx++) {
        const tx = b.x + dx;
        const ty = b.y + dy;
        const key = tileKey(tx, ty);
        if (b.type === "road") {
          roadSet.add(key);
          roadTiles.push({ tx, ty });
        } else if (b.type === "wall") {
          wallSet.add(key);
          wallTiles.push({ tx, ty });
        } else if (b.type === "gate") {
          // Gate joins the wall set (continuous run) but is drawn by buildingQuad.
          wallSet.add(key);
        }
      }
    }
  }

  const quads: QuadSpec[] = [];
  const roadHex = BUILDING_COLORS.road ?? FALLBACK_BUILDING_COLOR;
  const wallHex = BUILDING_COLORS.wall ?? FALLBACK_BUILDING_COLOR;
  for (const { tx, ty } of roadTiles) {
    quads.push(...autotileQuads(tx, ty, neighbourMask(tx, ty, roadSet), roadHex, ROAD_BAND));
  }
  for (const { tx, ty } of wallTiles) {
    quads.push(...autotileQuads(tx, ty, neighbourMask(tx, ty, wallSet), wallHex, WALL_BAND));
  }
  return quads;
}

/** Re-export LAYER_NETWORK so citadel-renderer.ts can push network quads. */
export { LAYER_NETWORK };
