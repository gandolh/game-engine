/**
 * Static world geometry builders (chunk hollow-09a) — the ground plane (with
 * gentle terrain relief, `terrain.ts`'s `groundHeightAt`) and the 1x1
 * territory tile, which `static-draws.ts` translates to every territory tile
 * and merges into one mesh (corpus brief 31), each tile in its community's
 * territory material (`materials.ts`). Both are plain, deterministic mesh
 * builders over `@engine/core/render3d`'s primitives; no RNG, no sim coupling.
 */
import { quad, type Mesh } from "@engine/core/render3d";
import { GRID_SIZE } from "@hollow/sim-core/world";
import { groundHeightAt } from "./terrain";

/** How far above the terrain relief a territory tile floats, to avoid
 *  z-fighting with the ground mesh directly beneath it. Exported so
 *  `static-draws.ts` can place each tile the same way. */
export const TERRITORY_TINT_Z_OFFSET = 0.03;

/**
 * The town's ground plane as a single heightfield mesh: a `size x size` grid
 * of quads, one vertex per tile corner, z from `groundHeightAt`. One mesh,
 * one material ("grass") — the community territory is a SEPARATE overlay
 * (`buildTerritoryTileMesh`, merged in `static-draws.ts`), not baked into
 * this one, so territory boundaries can change (communities form/split/merge/
 * dissolve) without rebuilding the ground itself.
 */
export function buildGroundMesh(size: number = GRID_SIZE): Mesh {
  const cols = size + 1;
  const positions: [number, number, number][] = [];
  for (let gy = 0; gy <= size; gy++) {
    for (let gx = 0; gx <= size; gx++) {
      positions.push([gx, gy, groundHeightAt(gx, gy)]);
    }
  }
  const index = (gx: number, gy: number): number => gy * cols + gx;

  const tris: { a: number; b: number; c: number; material: string }[] = [];
  for (let gy = 0; gy < size; gy++) {
    for (let gx = 0; gx < size; gx++) {
      const a = index(gx, gy);
      const b = index(gx + 1, gy);
      const c = index(gx + 1, gy + 1);
      const d = index(gx, gy + 1);
      // CCW from above (+z outward), matching geometry.ts's box() top-face
      // winding convention (increasing x, then increasing y).
      tris.push({ a, b, c, material: "grass" });
      tris.push({ a, b: c, c: d, material: "grass" });
    }
  }
  return { positions, tris };
}

/**
 * One 1x1 territory tile, at the LOCAL origin (corners `(0,0)..(1,1)`, z=0),
 * in `materialKey` (a community's `territoryMaterialKey`, materials.ts).
 * `static-draws.ts` translates a copy to `[gx, gy, groundHeightAt(gx, gy) +
 * TERRITORY_TINT_Z_OFFSET]` for every `{gx, gy}` tile across every
 * community's `territory` and merges them.
 */
export function buildTerritoryTileMesh(materialKey: string): Mesh {
  return quad([0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], materialKey);
}
