/**
 * RaidSpawnSystem — spawns raider groups on a seeded, escalating schedule.
 *
 * Stage: "siege-spawn" (after population). The first raid arrives around day 5;
 * subsequent raids escalate in strength and arrive on a shrinking interval.
 * All randomness flows through a single RNG forked once at construction — never
 * per tick — so the schedule is fully deterministic for a given seed.
 */
import type { System, SimContext, Rng } from "@engine/core";
import { createRng } from "@engine/core";
import type { SimState, RaiderState, PlayerState } from "../sim-state";
import { pushEvent } from "../sim-state";
import { countNonRoadBuildings } from "./tiers";
import { bfsPath } from "../world/pathfinder";
import { isWalkable } from "../world/terrain";
import type { TerrainGrid } from "../world/terrain";

const EDGE_NAMES = ["north", "east", "south", "west"] as const;

/** A scout (watchpost/garrison owner) reveals an incoming raid this many days early. */
const SCOUT_LEAD_DAYS = 2;
/** Each active garrison stretches the next-raid interval by this many days (patrols deter). */
const GARRISON_DETER_DAYS = 1;

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
  private readonly baseRng: Rng;
  private readonly rivalBase: Rng;
  private readonly perPlayerRng = new Map<number, Rng>();

  /**
   * Cozy cold-open threat-defer (Chunk 2). When > 0, raid scheduling/spawning is
   * suppressed for a player until they own at least this many non-road buildings.
   * 0 (default) = disabled = today's exact behavior; the gate short-circuits BEFORE
   * any scheduling RNG draw (`rng.int`) so the schedule stream is untouched.
   */
  private readonly deferUntilBuildings: number;

  constructor(
    private readonly state: SimState,
    private readonly terrain: TerrainGrid,
    opts: { deferUntilBuildings?: number } = {},
  ) {
    this.deferUntilBuildings = opts.deferUntilBuildings ?? 0;
    // Fork the base RNG ONCE at construction — never per tick.
    this.baseRng = state.rng.fork("raids");
    // Citadel 33: rival streams come from a SEPARATE tree (createRng), so
    // deriving them never consumes `state.rng` (fork() pulls the parent) — that
    // keeps player 0's stream + all downstream state.rng forks byte-identical.
    this.rivalBase = createRng(state.rng.snapshot().seed).fork("raids-rivals");
  }

  /**
   * Citadel 33: per-player raid RNG so adding/removing a player never perturbs
   * another player's raid schedule. Player 0 uses the legacy base stream (solo
   * byte-identical); each other player derives an independent sub-stream off a
   * separate rival tree (cached, so a late-joining player can't shift earlier
   * players' already-derived streams).
   */
  private rngFor(p: PlayerState): Rng {
    let r = this.perPlayerRng.get(p.id);
    if (r === undefined) {
      r = p.id === 0 ? this.baseRng : this.rivalBase.fork(`p${p.id}`);
      this.perPlayerRng.set(p.id, r);
    }
    return r;
  }

  run(ctx: SimContext): void {
    const state = this.state;

    // Citadel 28/33: per-player PvE raids, each on an INDEPENDENT seeded stream.
    for (const p of state.players) {
      const rng = this.rngFor(p);
      // The siege game is opt-in: raids only begin once this player has a keep.
      // A pure economy town (no keep) is never raided. The raid clock is
      // (re)anchored to the moment the keep appears.
      if (p.keepPosition === null) {
        p.nextRaidTick = -1;
        continue;
      }

      // Cozy cold-open: hold off raid scheduling until the town has grown past its
      // seeded core. In solo cozy `keepPosition` is null anyway (raids never fire),
      // but this makes the intent explicit and covers MP-cozy. Short-circuits BEFORE
      // the `rng.int` scheduling draw below so the schedule stream stays untouched
      // (disabled when the threshold is 0 → byte-identical).
      if (this.deferUntilBuildings > 0 && countNonRoadBuildings(state, p.id) < this.deferUntilBuildings) {
        p.nextRaidTick = -1;
        continue;
      }

      // Schedule first raid if not yet scheduled.
      if (p.nextRaidTick < 0) {
        // First raid arrives around day 5.
        p.nextRaidTick = 5 * state.ticksPerDay + rng.int(0, state.ticksPerDay);
      }

      // Counterplay (scout): if this player has a watchpost or garrison, the next
      // raid is revealed SCOUT_LEAD_DAYS early — a legible warning the player can
      // act on (build/repair defenses, which decays raider morale). Fire once.
      const scoutLead = SCOUT_LEAD_DAYS * state.ticksPerDay;
      if (
        !p.scoutWarned &&
        p.nextRaidTick >= 0 &&
        ctx.tick >= p.nextRaidTick - scoutLead &&
        ctx.tick < p.nextRaidTick &&
        this.hasScout(p)
      ) {
        const incoming = 10 + p.raidCount * 5; // strength of the raid about to spawn
        pushEvent(
          state,
          `Day ${state.day + 1}: Scouts report raiders massing — strength ~${incoming} in ~${SCOUT_LEAD_DAYS} days.`,
        );
        p.scoutWarned = true;
      }

      if (ctx.tick < p.nextRaidTick) continue;

      // Spawn a raid.
      p.raidCount++;
      const raidNum = p.raidCount;

      // Escalating strength: base 10, +5 per raid.
      const strength = 10 + (raidNum - 1) * 5;

      // Spawn from a random map edge (N=0, E=1, S=2, W=3).
      const edge = rng.int(0, 4);
      const { x: spawnX, y: spawnY } = pickEdgeSpawn(edge, state.width, state.height, this.terrain, rng);

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
      let intervalDays = Math.max(3, 8 - (raidNum - 1) * 0.5);
      // Threat consequence: high threat shortens the interval (a visible escalation
      // the player races to defuse) — up to −3 days at threat 100.
      intervalDays -= (p.threatLevel / 100) * 3;
      // Garrison purpose: each active garrison deters, stretching the interval.
      intervalDays += this.garrisonCount(p) * GARRISON_DETER_DAYS;
      intervalDays = Math.max(2, intervalDays);
      const intervalTicks = Math.floor(intervalDays * state.ticksPerDay);
      p.nextRaidTick = ctx.tick + intervalTicks + rng.int(0, state.ticksPerDay);
      p.scoutWarned = false; // re-arm the scout for the next raid

      pushEvent(
        state,
        `Day ${state.day + 1}: Raid ${raidNum} spotted! Strength ${strength}. Raiders approach from the ${EDGE_NAMES[edge]!}.`,
      );
    }
  }

  /** True if player `p` owns a watchpost or garrison (can scout incoming raids). */
  private hasScout(p: PlayerState): boolean {
    for (const entity of this.state.buildingWorld.query("building")) {
      if (entity.building.ownerId !== p.id) continue;
      const t = entity.building.type;
      if (t === "watchpost" || t === "garrison") return true;
    }
    return false;
  }

  /** Count of player `p`'s garrison buildings (deters → fewer raids). */
  private garrisonCount(p: PlayerState): number {
    let n = 0;
    for (const entity of this.state.buildingWorld.query("building")) {
      if (entity.building.ownerId !== p.id) continue;
      if (entity.building.type === "garrison") n++;
    }
    return n;
  }
}
