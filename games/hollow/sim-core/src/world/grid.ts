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

/**
 * The hearth — chunk hollow-14c's ONE central, AUTHORED world feature (not
 * emergent, unlike a `Community`'s territory): a fixed tile at the map's
 * center every agent converges on during the day-cycle's GATHER phase (see
 * `world/day-cycle.ts`'s `dayPhase`) and disperses from during SLEEP. Fixed
 * at bootstrap time (not re-derived from `GRID_SIZE` per-call) since
 * `GRID_SIZE` itself never changes at runtime — a plain constant, same
 * convention as `GRID_SIZE` above. Surfaced on `HollowSnapshot.hearth`
 * (sim-bootstrap.ts) for chunk hollow-14d's renderer.
 */
export const HEARTH_TILE: { readonly gx: number; readonly gy: number } = {
  gx: Math.floor(GRID_SIZE / 2),
  gy: Math.floor(GRID_SIZE / 2),
};
