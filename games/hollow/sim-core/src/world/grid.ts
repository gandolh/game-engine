/**
 * The Hollow world grid — a fixed 64x64 tile plane. No obstacles, no
 * pathfinder for M1 (see `systems/act.ts`'s `stepToward`): resource nodes sit
 * in open terrain and agents step straight toward their target one tile per
 * tick. Later briefs (hollow-09's cozy-town scene, hollow-08's renderer) are
 * free to lay terrain/obstacles over this grid; hollow-03 only needs its
 * extent.
 */

export const GRID_SIZE = 64;

export function clampToGrid(v: number): number {
  return Math.max(0, Math.min(GRID_SIZE - 1, v));
}
