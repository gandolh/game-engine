/**
 * render-systems/set-pieces.ts — decorative OPEN-WATER props (brief 49, track 6).
 *
 * Purely visual seabed accents scattered out in the open ocean around the
 * islands: lone rocks and little sandbar patches resting deep below the water.
 * Modeled directly on the coral décor (geometry.ts `computeCoral`):
 *   - props sit ONLY on open-water (non-walkable) tiles, kept clear of the
 *     coastline by rejecting any tile adjacent (8-ring) to a walkable tile,
 *   - they never overlap coral, reefs, docks, or boat lanes,
 *   - they're spaced out (blue-noise: a min Chebyshev gap) so they read as
 *     scattered accents, not a clump,
 *   - they're drawn semi-transparent so they read as submerged seabed, not
 *     bright floating objects.
 *
 * This is RENDER-ONLY. Props are NOT regions, NOT roads, NOT walkable, and have
 * ZERO sim/pathfinding impact — `isWalkable` and the region/road grids are never
 * consulted for movement here, only to REJECT tiles. The scatter is computed
 * ONCE at module load from the FIXED `WORLD_GEN_SEED` (never the run seed and
 * never Math.random), so the layout is byte-identical on every run, exactly like
 * the baked coral.
 */

import { createRng } from "@engine/core";
import { WORLD_WIDTH, WORLD_HEIGHT, isWalkable, WORLD_GEN_SEED } from "../world/regions";
import { CORAL } from "./geometry";
import { CORAL_REEFS } from "../world/coral";

/**
 * Set-pieces are drawn semi-transparent (matching coral) so the flowing water
 * shows through and the muted shapes read as resting on the seabed below the
 * surface rather than sitting on top of the sea.
 */
export const SET_PIECE_ALPHA = 0.45;

/** A single decorative open-water prop (frame at a tile coordinate). */
export interface SetPieceTile {
  tx: number;
  ty: number;
  frame: string;
  rotation: number;
}

/**
 * The prop kinds, picked per-prop via `rng.pick`. All are EXISTING atlas frames
 * (no atlas regeneration): a rock (`structure/stone`) and two sandbar/seabed
 * patches (`tile/sand`, `tile/shore-sand`).
 */
const PROP_FRAMES = ["structure/stone", "tile/sand", "tile/shore-sand"] as const;

/** Target number of props to scatter across the open ocean. */
const TARGET_COUNT = 28;

/**
 * Blue-noise spacing: no two props within this Chebyshev (chessboard) distance.
 * Spacing 3 means accepted props are at least 3 tiles apart in max(|dx|,|dy|),
 * so they read as scattered accents rather than a clump.
 */
export const MIN_SPACING = 3;

/** Bound on candidate draws so generation terminates deterministically. */
const MAX_ATTEMPTS = 4000;
const QUARTER_TURN = Math.PI / 2;

const key = (x: number, y: number): number => y * WORLD_WIDTH + x;

/**
 * Compute the scattered open-water props. Seeded candidate-rejection: repeatedly
 * draw a random tile, accept it only if it passes every rejection rule AND is
 * far enough from already-placed props, until we hit the target count or exhaust
 * the deterministic attempt budget. The rng is consumed in a FIXED order (x, y,
 * frame, rotation per attempt) so placement is stable across runs.
 */
function computeSetPieces(): readonly SetPieceTile[] {
  // Forbidden tiles we must never place on: coral cells, reef tiles, dock tiles,
  // and boat-lane tiles. Built once as a key set for O(1) rejection.
  const forbidden = new Set<number>();
  for (const c of CORAL) forbidden.add(key(c.tx, c.ty));
  for (const reef of CORAL_REEFS) {
    forbidden.add(key(reef.dock.x, reef.dock.y));
    forbidden.add(key(reef.reef.x, reef.reef.y));
    for (const l of reef.lane) forbidden.add(key(l.x, l.y));
  }

  // A tile is eligible only if it's open water clear of the coast and not
  // forbidden. Mirrors computeCoral's open-water test (non-walkable + no
  // walkable neighbour in the 8-ring).
  const eligible = (tx: number, ty: number): boolean => {
    if (tx < 0 || ty < 0 || tx >= WORLD_WIDTH || ty >= WORLD_HEIGHT) return false;
    if (forbidden.has(key(tx, ty))) return false;
    if (isWalkable(tx, ty)) return false; // props sit on ocean, never on land/road
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        if (isWalkable(tx + dx, ty + dy)) return false; // off the coastline
      }
    }
    return true;
  };

  const rng = createRng(WORLD_GEN_SEED).fork("set-pieces");
  const placed: SetPieceTile[] = [];
  const placedKeys = new Set<number>();

  const farEnough = (tx: number, ty: number): boolean => {
    for (const p of placed) {
      const cheby = Math.max(Math.abs(p.tx - tx), Math.abs(p.ty - ty));
      if (cheby < MIN_SPACING) return false;
    }
    return true;
  };

  for (let attempt = 0; attempt < MAX_ATTEMPTS && placed.length < TARGET_COUNT; attempt++) {
    // FIXED consumption order: x, then y, then frame, then rotation. Always draw
    // all four so the rng stream stays aligned regardless of acceptance.
    const tx = rng.int(0, WORLD_WIDTH);
    const ty = rng.int(0, WORLD_HEIGHT);
    const frame = rng.pick(PROP_FRAMES);
    const rotation = rng.int(0, 4) * QUARTER_TURN;
    if (placedKeys.has(key(tx, ty))) continue;
    if (!eligible(tx, ty)) continue;
    if (!farEnough(tx, ty)) continue;
    placed.push({ tx, ty, frame, rotation });
    placedKeys.add(key(tx, ty));
  }

  return placed;
}

/** The baked decorative open-water props, computed once at module load. */
export const SET_PIECES: readonly SetPieceTile[] = computeSetPieces();
