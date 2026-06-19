/**
 * TerritorySystem (Citadel 30) — influence-radius territory + build-gating.
 *
 * Each player's territory is a derived set of tile indices within `radius`
 * (Manhattan) of any building they own — auto-growing as they build, recomputed
 * on building-change exactly like RoadConnectivitySystem (a pure pass over the
 * owned-building set, NOT drift-prone per-tile storage). Determinism-safe: no
 * RNG, no wall-clock; the result is inert unless build-gating reads it.
 *
 * Build-gating (opt-in via `enforceTerritory`): a player may build only within
 * their territory ∪ adjacent unclaimed tiles — so they can expand into open
 * ground but never into a rival's claim. The first (anchor / town-hall)
 * placement, made before any territory exists, may go on any unclaimed tile.
 *
 * Contested-tile rule (in-brief tuning): on overlap, the lowest player id wins
 * the claim (stable + deterministic). 4-connected adjacency.
 *
 * Stage: "connectivity", registered BEFORE RoadConnectivitySystem so it reads
 * `connectivityDirty` before that system clears it.
 */
import type { System, SimContext } from "@engine/core";
import type { SimState, PlayerState } from "../sim-state";

export const DEFAULT_TERRITORY_RADIUS = 10;

/** Recompute every player's territory from the buildings they own. */
export function recomputeTerritory(state: SimState, radius: number): void {
  for (const p of state.players) p.territory.clear();
  for (const entity of state.buildingWorld.query("building")) {
    let p: PlayerState | undefined;
    for (const q of state.players) { if (q.id === entity.building.ownerId) { p = q; break; } }
    if (p === undefined) continue;
    const b = entity.building;
    const cx = b.x + Math.floor(b.w / 2);
    const cy = b.y + Math.floor(b.h / 2);
    for (let dy = -radius; dy <= radius; dy++) {
      const rem = radius - Math.abs(dy);
      const ty = cy + dy;
      if (ty < 0 || ty >= state.height) continue;
      for (let dx = -rem; dx <= rem; dx++) {
        const tx = cx + dx;
        if (tx < 0 || tx >= state.width) continue;
        p.territory.add(ty * state.width + tx);
      }
    }
  }
}

/** The id of the player whose territory claims `tileIdx` (lowest id on overlap), or -1. */
export function tileClaimedBy(state: SimState, tileIdx: number): number {
  for (const p of state.players) {
    if (p.territory.has(tileIdx)) return p.id;
  }
  return -1;
}

/**
 * Whether player `p` may place a `w×h` footprint at (x,y): every footprint tile
 * must be in p's territory, or unclaimed-and-adjacent to p's territory. Before p
 * has any territory (the anchor placement), any in-bounds unclaimed tile is OK.
 */
export function canBuildAt(state: SimState, p: PlayerState, x: number, y: number, w: number, h: number): boolean {
  const W = state.width;
  const H = state.height;
  const firstBuild = p.territory.size === 0;
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return false;
      const idx = ty * W + tx;
      const claim = tileClaimedBy(state, idx);
      if (claim === p.id) continue;       // already ours
      if (claim !== -1) return false;     // a rival's claim — never buildable
      if (firstBuild) continue;           // anchor: any unclaimed tile
      // unclaimed tile: allowed only if 4-adjacent to our own territory
      const adj =
        (ty > 0 && p.territory.has((ty - 1) * W + tx)) ||
        (ty + 1 < H && p.territory.has((ty + 1) * W + tx)) ||
        (tx > 0 && p.territory.has(ty * W + (tx - 1))) ||
        (tx + 1 < W && p.territory.has(ty * W + (tx + 1)));
      if (!adj) return false;
    }
  }
  return true;
}

export class TerritorySystem implements System {
  readonly name = "TerritorySystem";

  constructor(private readonly state: SimState, private readonly radius: number) {}

  run(_ctx: SimContext): void {
    // Recompute on building-change. Runs BEFORE RoadConnectivitySystem (same
    // stage) which clears connectivityDirty — we only read it.
    if (!this.state.connectivityDirty) return;
    recomputeTerritory(this.state, this.radius);
  }
}
