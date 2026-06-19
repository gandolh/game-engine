/**
 * BFS building clustering into composite silhouettes (brief 12) — pure, tested.
 *
 * SPECULATIVE / LOW-PRIORITY (per the brief). Flood-fill adjacent same-type
 * buildings (default: houses) over 4-adjacency of their footprints, then draw
 * each multi-member cluster as ONE composite fill instead of N separate
 * stamps, so a housing block reads as a unified shape rather than a grid.
 *
 * SIMPLIFICATION (documented & accepted by the brief): we do NOT synthesize
 * L/T/+/square composite silhouettes. A cluster of >=2 draws as the UNION of
 * its member footprints (every covered tile filled in the house color) plus a
 * subtle unifying border, which reads as one block. Single (un-clustered)
 * houses fall through to the normal `buildingQuad` path. Cheap: the union is
 * computed from the same tile-key set the BFS already builds.
 */
import { TILE_SIZE } from "@citadel/sim-core";
import type { BuildingSnapshot } from "@citadel/sim-core";
import { EDG } from "@engine/core";
import { packTint } from "./quads";
import type { QuadSpec } from "./quads";
import { tileKey } from "./autotile";

/** A connected cluster of same-type buildings + its bounding region. */
export interface Cluster {
  /** The member buildings (in input order). */
  members: BuildingSnapshot[];
  /** Bounding region in tile coords (min inclusive, max exclusive). */
  minTx: number;
  minTy: number;
  maxTx: number; // exclusive
  maxTy: number; // exclusive
  /** Set of every tile key (`ty*WORLD_WIDTH+tx`) the cluster's footprints cover. */
  tiles: Set<number>;
}

/**
 * Connected-components over 4-adjacency of same-`type` building footprints. Two
 * buildings join a cluster when any of their covered tiles are orthogonally
 * adjacent or overlapping. Buildings of other types are ignored entirely.
 * Returns one `Cluster` per component (including singletons). Pure.
 */
export function clusterBuildings(
  buildings: readonly BuildingSnapshot[],
  type = "house",
): Cluster[] {
  const subjects = buildings.filter((b) => b.type === type);

  // Map every covered tile key → index of its owning subject building.
  const tileOwner = new Map<number, number>();
  for (let i = 0; i < subjects.length; i++) {
    const b = subjects[i]!;
    for (let dy = 0; dy < b.h; dy++) {
      for (let dx = 0; dx < b.w; dx++) {
        tileOwner.set(tileKey(b.x + dx, b.y + dy), i);
      }
    }
  }

  const seen = new Array<boolean>(subjects.length).fill(false);
  const clusters: Cluster[] = [];

  for (let start = 0; start < subjects.length; start++) {
    if (seen[start]) continue;
    // BFS over building indices, where edges are 4-adjacent covered tiles.
    const queue = [start];
    seen[start] = true;
    const members: BuildingSnapshot[] = [];
    const tiles = new Set<number>();
    let minTx = Infinity;
    let minTy = Infinity;
    let maxTx = -Infinity;
    let maxTy = -Infinity;

    while (queue.length > 0) {
      const idx = queue.pop()!;
      const b = subjects[idx]!;
      members.push(b);
      minTx = Math.min(minTx, b.x);
      minTy = Math.min(minTy, b.y);
      maxTx = Math.max(maxTx, b.x + b.w);
      maxTy = Math.max(maxTy, b.y + b.h);
      for (let dy = 0; dy < b.h; dy++) {
        for (let dx = 0; dx < b.w; dx++) {
          const tx = b.x + dx;
          const ty = b.y + dy;
          tiles.add(tileKey(tx, ty));
          // 4-neighbour tiles owned by another (unseen) subject → same cluster.
          const neighbours = [
            tileKey(tx, ty - 1),
            tileKey(tx + 1, ty),
            tileKey(tx, ty + 1),
            tileKey(tx - 1, ty),
          ];
          for (const nk of neighbours) {
            const owner = tileOwner.get(nk);
            if (owner !== undefined && !seen[owner]) {
              seen[owner] = true;
              queue.push(owner);
            }
          }
        }
      }
    }

    clusters.push({ members, tiles, minTx, minTy, maxTx, maxTy });
  }
  return clusters;
}

/**
 * Render the subtle unifying border for a multi-member cluster: a darker,
 * semi-transparent frame around the cluster's bounding region, so a block of
 * adjacent houses reads as one neighbourhood. Returns `[]` for singletons (and
 * empty clusters) — each individual house is now drawn as its own sprite by the
 * caller, so there is no union-fill any more, just this framing accent.
 *
 * Drawn on the 1×1 `px` frame (no `frame` set → tinted box). Pure. EDG-only.
 */
export function clusterBorderQuads(cluster: Cluster): QuadSpec[] {
  if (cluster.members.length < 2) return [];

  const bx = cluster.minTx * TILE_SIZE;
  const by = cluster.minTy * TILE_SIZE;
  const bw = (cluster.maxTx - cluster.minTx) * TILE_SIZE;
  const bh = (cluster.maxTy - cluster.minTy) * TILE_SIZE;
  const border = packTint(EDG.woodDark, Math.round(0xff * 0.5));
  const t = Math.max(1, TILE_SIZE * 0.1);
  return [
    { x: bx, y: by, width: bw, height: t, tintRgba: border }, // top
    { x: bx, y: by + bh - t, width: bw, height: t, tintRgba: border }, // bottom
    { x: bx, y: by, width: t, height: bh, tintRgba: border }, // left
    { x: bx + bw - t, y: by, width: t, height: bh, tintRgba: border }, // right
  ];
}
