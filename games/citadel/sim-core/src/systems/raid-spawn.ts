/**
 * RaidSpawnSystem — spawns raider groups on a seeded, escalating schedule.
 *
 * Stage: "siege-spawn" (after population). The first raid arrives around day 5;
 * subsequent raids escalate in strength and arrive on a shrinking interval.
 * All randomness flows through a single RNG forked once at construction — never
 * per tick — so the schedule is fully deterministic for a given seed.
 */
import type { System, SimContext, Rng } from "@engine/core";
import type { SimState, RaiderState, PlayerState } from "../sim-state";
import { pushEvent } from "../sim-state";
import { bfsPath } from "../world/pathfinder";
import { isWalkable } from "../world/terrain";
import type { TerrainGrid } from "../world/terrain";

const EDGE_NAMES = ["north", "east", "south", "west"] as const;

/**
 * Raider walkability: any terrain-walkable, non-wall tile. Gates are passable.
 * Citadel 28: blocked by the TARGET player `p`'s walls (raiders besiege one
 * player's settlement).
 */
export function raiderWalkable(state: SimState, p: PlayerState, terrain: TerrainGrid, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= state.width || ty >= state.height) return false;
  const idx = ty * state.width + tx;
  if (p.wallTiles.has(idx)) return false; // the target player's walls block raiders
  return isWalkable(terrain, tx, ty); // terrain walkability (no water/rough)
}

/** Pick a spawn tile on the given map edge (0=N,1=E,2=S,3=W); prefer walkable. */
export function pickEdgeSpawn(
  edge: number,
  width: number,
  height: number,
  terrain: TerrainGrid,
  rng: Rng,
): { x: number; y: number } {
  // Try several positions along the edge until a terrain-walkable one is found.
  for (let attempt = 0; attempt < 32; attempt++) {
    let x: number;
    let y: number;
    if (edge === 0) { x = rng.int(0, width); y = 0; }
    else if (edge === 1) { x = width - 1; y = rng.int(0, height); }
    else if (edge === 2) { x = rng.int(0, width); y = height - 1; }
    else { x = 0; y = rng.int(0, height); }
    if (isWalkable(terrain, x, y)) return { x, y };
  }
  // Fallback: a deterministic corner-ish tile on the edge.
  if (edge === 0) return { x: Math.floor(width / 2), y: 0 };
  if (edge === 1) return { x: width - 1, y: Math.floor(height / 2) };
  if (edge === 2) return { x: Math.floor(width / 2), y: height - 1 };
  return { x: 0, y: Math.floor(height / 2) };
}

/** The raider target: player `p`'s keep if placed, otherwise the map center. */
export function findRaiderTarget(state: SimState, p: PlayerState): { x: number; y: number } {
  if (p.keepPosition !== null) return p.keepPosition;
  return { x: Math.floor(state.width / 2), y: Math.floor(state.height / 2) };
}

/** Compute a raider path from (sx,sy) toward (gx,gy) using `p`'s wall-aware predicate. */
export function computeRaiderPath(
  sx: number,
  sy: number,
  gx: number,
  gy: number,
  state: SimState,
  p: PlayerState,
  terrain: TerrainGrid,
): Array<{ x: number; y: number }> | null {
  return bfsPath(
    sx,
    sy,
    gx,
    gy,
    (tx, ty) => raiderWalkable(state, p, terrain, tx, ty),
    state.width,
    state.height,
  );
}

export class RaidSpawnSystem implements System {
  readonly name = "RaidSpawnSystem";
  private readonly rng: Rng;

  constructor(private readonly state: SimState, private readonly terrain: TerrainGrid) {
    // Fork the RNG ONCE at construction — never per tick.
    this.rng = state.rng.fork("raids");
  }

  run(ctx: SimContext): void {
    const state = this.state;

    // Citadel 28: per-player PvE raids. Each player with a keep gets their own
    // escalating raid schedule. ONE shared raids RNG pulled in stable player-id
    // order → solo (player 0) byte-identical to the pre-refactor schedule.
    for (const p of state.players) {
      // The siege game is opt-in: raids only begin once this player has a keep.
      // A pure economy town (no keep) is never raided. The raid clock is
      // (re)anchored to the moment the keep appears.
      if (p.keepPosition === null) {
        p.nextRaidTick = -1;
        continue;
      }

      // Schedule first raid if not yet scheduled.
      if (p.nextRaidTick < 0) {
        // First raid arrives around day 5.
        p.nextRaidTick = 5 * state.ticksPerDay + this.rng.int(0, state.ticksPerDay);
      }

      if (ctx.tick < p.nextRaidTick) continue;

      // Spawn a raid.
      p.raidCount++;
      const raidNum = p.raidCount;

      // Escalating strength: base 10, +5 per raid.
      const strength = 10 + (raidNum - 1) * 5;

      // Spawn from a random map edge (N=0, E=1, S=2, W=3).
      const edge = this.rng.int(0, 4);
      const { x: spawnX, y: spawnY } = pickEdgeSpawn(edge, state.width, state.height, this.terrain, this.rng);

      const target = findRaiderTarget(state, p);
      const path = computeRaiderPath(spawnX, spawnY, target.x, target.y, state, p, this.terrain);

      const raider: RaiderState = {
        id: raidNum,
        x: spawnX,
        y: spawnY,
        tileX: spawnX,
        tileY: spawnY,
        path: path ?? [],
        pathStep: 0,
        strength,
        resolved: false,
      };
      p.raiders.push(raider);

      // Update threat level.
      p.threatLevel = Math.min(100, p.threatLevel + 15);

      // Schedule next raid: base interval 8 days, shrinking 0.5 days per raid, min 3.
      const intervalDays = Math.max(3, 8 - (raidNum - 1) * 0.5);
      const intervalTicks = Math.floor(intervalDays * state.ticksPerDay);
      p.nextRaidTick = ctx.tick + intervalTicks + this.rng.int(0, state.ticksPerDay);

      pushEvent(
        state,
        `Day ${state.day + 1}: Raid ${raidNum} spotted! Strength ${strength}. Raiders approach from the ${EDGE_NAMES[edge]!}.`,
      );
    }
  }
}
