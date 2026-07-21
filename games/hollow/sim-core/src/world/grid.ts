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

/**
 * The graveyard — chunk hollow-15's ONE central, AUTHORED burial ground (same
 * "fixed authored world feature, not emergent" convention as `HEARTH_TILE`
 * above). A grave-digger carries each corpse here to bury it
 * (`mortality/care-act-system.ts`). Placed a MODERATE distance from the center
 * hearth (offset +12,+12 → the disease-radius-3 zone around it never reaches
 * the hearth crowd) rather than a far corner: burial must keep pace with rot
 * (`CORPSE_ROT_DELAY_DAYS`) or an epidemic spirals, and deaths cluster near the
 * town center, so the grave-digger's body→graveyard round trip has to be
 * walkable within the rot grace window. A far-corner graveyard made burial
 * hopeless and turned every death into an outbreak. Surfaced on
 * `HollowSnapshot.graveyard` (sim-bootstrap.ts) for the hollow-15 renderer.
 */
export const GRAVEYARD_TILE: { readonly gx: number; readonly gy: number } = {
  gx: Math.floor(GRID_SIZE / 2) + 12,
  gy: Math.floor(GRID_SIZE / 2) + 12,
};
