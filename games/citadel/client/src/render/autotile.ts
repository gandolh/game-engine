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
 * PERF: masks are recomputed every frame from the building snapshot. Road+wall
 * tiles are a small fraction of the world and well under the brief's ~1000-tile
 * budget, so recompute-per-frame is fine and avoids cache invalidation on
 * placement commands. (The cost tracks the network's size, not the map's.)
 */
import { EDG } from "@engine/core";
import { TILE_SIZE } from "@citadel/sim-core";
import type { BuildingSnapshot } from "@citadel/sim-core";
import { packTint, FALLBACK_BUILDING_COLOR } from "./quads";
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

// ---------------------------------------------------------------------------
// Cozy warm network tones (art-02 sub-phase E)
// ---------------------------------------------------------------------------
//
// The network tints were the cold `BUILDING_COLORS.road`/`.wall` (navy / steel).
// Per the [cozy iso art style bible](../../../../../corpus/wiki/citadel-art-style.md):
// "Cool = shadow & depth only (never the dominant read)" and roads/dirt/walls
// should "read warm, not cold-grey." So the network surfaces own their own WARM
// EDG neighbours here instead of borrowing the cold building swatches:
//
//   - road  → `wood` (a warm packed-dirt / earthy cobble brown) rather than `navy`.
//   - wall  → `tan`  (warm plaster/stone) rather than cold `steel`.
//   - bridge stays `wood` (already warm timber), matching the plank deck recipe.
//
// These tints color the SOLID diamond/arm paths (walls in iso, and the flat
// `networkQuads` arm geometry used by the fused-run tests). The textured
// `fx/road` cobble + `fx/bridge` plank frames draw white-tinted and carry their
// own EDG palette (owned by `sprites/recipes/fx.ts`) — see the concern noted in
// the sub-phase E report: warming the cobble stones themselves is a fx.ts edit.
const ROAD_TINT = EDG.wood;
const WALL_TINT = EDG.tan;
const BRIDGE_TINT = EDG.wood;

/**
 * Row stride for packing a tile into a single integer key. A FIXED constant, not
 * the world width — see `tileKey`. Matches the stride `ambient-crowd.ts` already
 * uses. Worlds must stay under this; 192×192 today (brief 110).
 */
export const TILE_KEY_STRIDE = 4096;

/**
 * Pack a tile into a single integer key (`ty*TILE_KEY_STRIDE + tx`).
 *
 * The stride is a CONSTANT wider than any world, not `WORLD_WIDTH`. Using the
 * world width made the packing non-injective over the coordinates this function
 * is actually called with: `neighbourMask` probes `tx-1` and `tx+1`, so at
 * width W it evaluated `tileKey(W, ty) === tileKey(0, ty+1)` and
 * `tileKey(-1, ty) === tileKey(W-1, ty-1)`. A road on the east edge column
 * therefore reported a connection to column 0 of the NEXT row, and vice versa —
 * a real bug at every world size, invisible only because a centred town never
 * touches the map edge.
 *
 * With a stride wider than the world, the off-grid probes land on column indices
 * (`W`, or `STRIDE-1` for `tx = -1`) that no real tile ever occupies, so they
 * simply miss the membership set. Pure.
 */
export function tileKey(tx: number, ty: number): number {
  return ty * TILE_KEY_STRIDE + tx;
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
  const roadHex = ROAD_TINT ?? FALLBACK_BUILDING_COLOR;
  const wallHex = WALL_TINT ?? FALLBACK_BUILDING_COLOR;
  for (const { tx, ty } of roadTiles) {
    quads.push(...autotileQuads(tx, ty, neighbourMask(tx, ty, roadSet), roadHex, ROAD_BAND));
  }
  for (const { tx, ty } of wallTiles) {
    quads.push(...autotileQuads(tx, ty, neighbourMask(tx, ty, wallSet), wallHex, WALL_BAND));
  }
  return quads;
}

/**
 * Iso road/wall tiles: the connected road + wall network as a flat list of
 * `(tx, ty, hex, band)` tiles for the ISO renderer, which draws each as a
 * diamond filling (a fraction of) its tile. Adjacent same-network diamonds abut,
 * so a run reads continuous without explicit arm geometry — the autotile mask is
 * no longer needed once tiles are diamonds. Gates keep their distinct
 * `buildingQuad` draw (and so are excluded here, as before). Pure.
 */
export interface IsoNetworkTile {
  tx: number;
  ty: number;
  /** The network kind ("road" | "wall" | "bridge") this tile belongs to. */
  type: string;
  hex: string;
  /** Diamond inset fraction (roads thinner than walls), matching the old bands. */
  band: number;
  /**
   * Optional textured frame to stamp instead of the flat tinted diamond. Roads
   * use a cobblestone diamond and bridges a plank-deck diamond; walls keep the
   * solid tinted diamond (frame omitted). When set, the tile is drawn white-tint
   * so the recipe's own recipe colors show.
   */
  frame?: string;
  /**
   * 4-neighbour connectivity mask (N|E|S|W bits) toward SAME-network tiles —
   * i.e. which of this diamond's four edges ABUT another tile of the same run.
   *
   * PIXEL-TANGENT AUDIT (art-02 sub-phase E): the style bible says "no outline
   * where tiles abut (avoids pixel tangents on autotiled roads/walls)." Each
   * road/bridge diamond frame bakes a dark edge rim (`fx/road` ink rim,
   * `fx/bridge` beam); where two same-network diamonds meet, both rims stack and
   * the seam reads as a hard DOUBLED outline down the middle of a straight run
   * instead of a soft continuous surface. This mask is the per-tile data a
   * renderer needs to suppress the rim on an abutting edge (draw the soft
   * interior tone there instead). Exposed here (the pure, tested layer) so the
   * fix can be driven without recomputing adjacency in the renderer; the actual
   * rim-drop is a follow-up in the frame recipe / renderer (sibling-owned files).
   * `bridge` uses the road membership set (roads + bridges share a run so a
   * bridge mouth fuses into the road it meets).
   */
  abut: number;
}

export function isoNetworkTiles(
  buildings: readonly BuildingSnapshot[],
  frames?: { road?: string; bridge?: string },
): IsoNetworkTile[] {
  const roadHex = ROAD_TINT ?? FALLBACK_BUILDING_COLOR;
  const wallHex = WALL_TINT ?? FALLBACK_BUILDING_COLOR;
  const bridgeHex = BRIDGE_TINT ?? FALLBACK_BUILDING_COLOR;

  // First pass: membership sets so the abutment mask (pixel-tangent suppression
  // data) can be computed per tile. Roads + bridges share a run (a bridge mouth
  // fuses into the road it meets); walls + gates share a run (a wall continues
  // through a gate, mirroring `networkQuads`).
  const roadSet = new Set<number>();
  const wallSet = new Set<number>();
  for (const b of buildings) {
    if (b.type !== "road" && b.type !== "bridge" && b.type !== "wall" && b.type !== "gate") continue;
    for (let dy = 0; dy < b.h; dy++) {
      for (let dx = 0; dx < b.w; dx++) {
        const key = tileKey(b.x + dx, b.y + dy);
        if (b.type === "road" || b.type === "bridge") roadSet.add(key);
        else wallSet.add(key); // wall + gate
      }
    }
  }

  const out: IsoNetworkTile[] = [];
  for (const b of buildings) {
    // Roads and bridges fill the whole tile (band 1) when textured — the cobble
    // / plank art carries the visual, so no inset is needed; walls stay banded.
    let hex: string | null = null;
    let band = WALL_BAND;
    let frame: string | undefined;
    let members: ReadonlySet<number> | null = null;
    if (b.type === "road") {
      hex = roadHex; band = frames?.road !== undefined ? 1 : ROAD_BAND; frame = frames?.road; members = roadSet;
    } else if (b.type === "bridge") {
      hex = bridgeHex; band = 1; frame = frames?.bridge; members = roadSet;
    } else if (b.type === "wall") {
      hex = wallHex; band = WALL_BAND; members = wallSet;
    } else {
      continue;
    }
    for (let dy = 0; dy < b.h; dy++) {
      for (let dx = 0; dx < b.w; dx++) {
        const tx = b.x + dx;
        const ty = b.y + dy;
        // Abutment mask: which edges meet a same-network neighbour. The renderer
        // suppresses the baked frame rim on these edges so seams read soft (no
        // doubled "pixel tangent" outline down a fused run) — style-bible rule.
        const abut = neighbourMask(tx, ty, members);
        out.push({ tx, ty, type: b.type, hex, band, abut, ...(frame !== undefined ? { frame } : {}) });
      }
    }
  }
  return out;
}

/** Re-export LAYER_NETWORK so citadel-renderer.ts can push network quads. */
export { LAYER_NETWORK };
