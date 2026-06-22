/**
 * Citadel ambient crowd (brief 18) — a thin procedural pedestrian decoration
 * layer. These are NOT ECS entities and NEVER touch the sim: they are
 * render-only, driven by a render-side RNG seeded off a fixed CONSTANT (never
 * `state.rng`, never the sim sequence), so they have zero determinism impact.
 *
 * Pedestrians wander the road network derived from the building snapshot,
 * stepping ORTHOGONALLY from road tile to adjacent road tile so they always
 * stay ON a path (never cutting across grass or buildings). A small walk-cycle
 * bob (a vertical hop while moving) animates them with no extra sprite frames.
 * The pool is pre-allocated and hard-capped; the ACTIVE count scales by
 * settlement tier (Hamlet few → Fortress-City many). Drawn as small EDG-colored
 * quads on a dedicated layer below villagers.
 *
 * SIEGE behavior: when raiders are present the streets clear — active
 * pedestrians are hidden (count target → 0) for immersion. They return once the
 * siege lifts. (Decision recorded in-brief: "hide during siege".)
 */
import { EDG, createRng } from "@engine/core";
import type { Rng } from "@engine/core";
import { TILE_SIZE } from "@citadel/sim-core";
import type { BuildingSnapshot, RenderSnapshot } from "@citadel/sim-core";
import { packTint, type QuadSpec } from "./citadel-renderer";
import { FRAME_PEDESTRIAN } from "./sprites/recipes";

/** Fixed render seed — distinct from any sim seed; keeps the crowd reproducible
 *  frame-to-frame without ever reading the sim RNG. */
const CROWD_RENDER_SEED = 0x0c1ade17 >>> 0;

/** Hard pool cap for a 96×96 world (FV caps particles at 512; pedestrians are
 *  cheaper but fewer make sense — pick 96). */
export const CROWD_CAP = 96;

/** Pedestrian billboard size, in world px. The figure is the small 16px
 *  `vil/pedestrian` sprite; ~0.8 tiles tall reads as a background commoner
 *  (smaller than the 1.1-tile villager). */
const PED_SIZE = TILE_SIZE * 0.8;

/** Walk speed range, world px/s. */
const SPEED_MIN = 8;
const SPEED_MAX = 18;

/**
 * Clothing tints for the pedestrians — a broad spread of EDG commoner colors.
 * The shared `vil/pedestrian` sprite has a WHITE tunic that this tint recolors
 * (texture × tint), so one base figure yields a visibly varied crowd. Skin and
 * boots are baked into the sprite and stay roughly fixed across tints. Wider
 * than before (was 5 muted swatches) so a dense street doesn't look uniform.
 */
const PED_COLORS: readonly string[] = [
  EDG.tan, EDG.cream, EDG.salmon, EDG.steel, EDG.clay,
  EDG.wood, EDG.green, EDG.blue, EDG.mauve, EDG.gold,
  EDG.crimson, EDG.teal,
];

/**
 * Target active pedestrian count per settlement tier. MONOTONIC non-decreasing
 * up the ladder, clamped to the pool cap. PURE.
 */
export function densityForTier(tier: string): number {
  switch (tier) {
    case "Hamlet":
      return 6;
    case "Village":
      return 18;
    case "Town":
      return 40;
    case "Citadel":
      return 70;
    case "Fortress-City":
      return CROWD_CAP;
    default:
      return 6;
  }
}

/** Walk-cycle bob: vertical hop amplitude (world px) and angular speed (rad/s).
 *  A pedestrian moving along the road bounces up-and-down ~2px at ~9 rad/s,
 *  reading as a tiny two-frame walk shuffle without any extra sprite frames. */
const BOB_AMPLITUDE = 2;
const BOB_SPEED = 9;

interface Pedestrian {
  active: boolean;
  /** Current world-px position. */
  x: number;
  y: number;
  /** The road tile (col,row) this pedestrian currently stands on / departs from. */
  cx: number;
  cy: number;
  /** Destination world-px (the center of an ADJACENT road tile). */
  tx: number;
  ty: number;
  /** Destination road tile (col,row). */
  dcx: number;
  dcy: number;
  speed: number;
  tint: number;
  /** Per-pedestrian walk-cycle phase (rad), so the crowd doesn't bob in lockstep. */
  phase: number;
  /** True while stepping toward a destination tile (drives the walk bob). */
  moving: boolean;
}

/** A walkable road tile, in tile (col,row) coords plus its world-px center. */
interface RoadTile {
  col: number;
  row: number;
  x: number;
  y: number;
}

/** Pack a tile (col,row) into a single integer key for the road-tile set. */
function tileKey(col: number, row: number): number {
  return row * 4096 + col;
}

/** The walkable road network derived from a snapshot: the tiles plus a fast
 *  lookup so we can confine wandering to road tiles and their road neighbours. */
interface RoadNetwork {
  tiles: RoadTile[];
  byKey: Map<number, RoadTile>;
}

/** Pull the road-tile network (tiles + key lookup) out of a building snapshot.
 *  Roads + gates are the walkable spine; each occupied cell becomes one tile. */
function roadNetworkOf(buildings: readonly BuildingSnapshot[]): RoadNetwork {
  const tiles: RoadTile[] = [];
  const byKey = new Map<number, RoadTile>();
  for (const b of buildings) {
    if (b.type !== "road" && b.type !== "gate") continue;
    for (let dy = 0; dy < b.h; dy++) {
      for (let dx = 0; dx < b.w; dx++) {
        const col = b.x + dx;
        const row = b.y + dy;
        const t: RoadTile = {
          col, row,
          x: (col + 0.5) * TILE_SIZE,
          y: (row + 0.5) * TILE_SIZE,
        };
        tiles.push(t);
        byKey.set(tileKey(col, row), t);
      }
    }
  }
  return { tiles, byKey };
}

/** The four orthogonal neighbour offsets — pedestrians step tile-to-tile along
 *  the road network (no diagonals), so they never cut a corner off the path. */
const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

export class CitadelAmbientCrowd {
  private readonly rng: Rng;
  private readonly pool: Pedestrian[] = [];
  private roads: RoadNetwork = { tiles: [], byKey: new Map() };
  /** Wall-clock-ish accumulator (seconds) driving the walk-cycle bob. */
  private walkTime = 0;

  constructor(seed: number = CROWD_RENDER_SEED) {
    this.rng = createRng(seed >>> 0);
    for (let i = 0; i < CROWD_CAP; i++) {
      this.pool.push({
        active: false,
        x: 0,
        y: 0,
        cx: 0,
        cy: 0,
        tx: 0,
        ty: 0,
        dcx: 0,
        dcy: 0,
        speed: SPEED_MIN,
        tint: packTint(PED_COLORS[i % PED_COLORS.length]!),
        phase: this.rng.range(0, Math.PI * 2),
        moving: false,
      });
    }
  }

  /** Live active count (never exceeds CROWD_CAP). */
  get activeCount(): number {
    let n = 0;
    for (const p of this.pool) if (p.active) n++;
    return n;
  }

  /**
   * Advance the crowd by `dt` seconds against the latest snapshot. Spawns/retires
   * pedestrians toward the tier target (0 during a siege), confines wandering to
   * road tiles, and retargets a pedestrian when it reaches its destination.
   */
  update(dt: number, snapshot: RenderSnapshot): void {
    this.roads = roadNetworkOf(snapshot.buildings);
    this.walkTime += dt;

    // No walkable ground (very early game) → retire everyone, nothing to do.
    if (this.roads.tiles.length === 0) {
      for (const p of this.pool) p.active = false;
      return;
    }

    const underSiege = snapshot.raiders.length > 0;
    const target = underSiege ? 0 : Math.min(CROWD_CAP, densityForTier(snapshot.tier));

    let active = this.activeCount;

    // Retire surplus pedestrians (siege, or tier dropped) — cheap: flip flags.
    if (active > target) {
      for (const p of this.pool) {
        if (active <= target) break;
        if (p.active) {
          p.active = false;
          active--;
        }
      }
    }

    // Spawn toward target on free road points.
    if (active < target) {
      for (const p of this.pool) {
        if (active >= target) break;
        if (!p.active) {
          this.spawn(p);
          active++;
        }
      }
    }

    // Advance active pedestrians toward their (adjacent road tile) targets;
    // step to the next road neighbour on arrival so they stay on the path.
    for (const p of this.pool) {
      if (!p.active) continue;
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const dist = Math.hypot(dx, dy);
      const step = p.speed * dt;
      if (dist <= step || dist < 0.5) {
        p.x = p.tx;
        p.y = p.ty;
        // Snapped onto the destination tile; that's where we depart from next.
        p.cx = p.dcx;
        p.cy = p.dcy;
        this.retarget(p);
      } else {
        p.x += (dx / dist) * step;
        p.y += (dy / dist) * step;
      }
    }
  }

  private spawn(p: Pedestrian): void {
    const start = this.roads.tiles[this.rng.int(0, this.roads.tiles.length)]!;
    p.active = true;
    p.x = start.x;
    p.y = start.y;
    p.cx = start.col;
    p.cy = start.row;
    p.speed = this.rng.range(SPEED_MIN, SPEED_MAX);
    p.phase = this.rng.range(0, Math.PI * 2);
    this.retarget(p);
  }

  /**
   * Pick the next destination: a road tile ORTHOGONALLY ADJACENT to the
   * pedestrian's current tile, so it walks the road network cell-by-cell and
   * never strays off a path. If the current tile has no road neighbours (an
   * isolated stub), fall back to teleport-retargeting to any road tile.
   */
  private retarget(p: Pedestrian): void {
    let chosen: RoadTile | undefined;
    // Reservoir-sample one of the available road neighbours (uniform, single pass).
    let seen = 0;
    for (const [ox, oy] of NEIGHBOURS) {
      const n = this.roads.byKey.get(tileKey(p.cx + ox, p.cy + oy));
      if (n === undefined) continue;
      seen++;
      if (this.rng.int(0, seen) === 0) chosen = n;
    }
    if (chosen === undefined) {
      // Isolated tile: hop to a random road tile so we don't stall forever.
      chosen = this.roads.tiles[this.rng.int(0, this.roads.tiles.length)]!;
      p.moving = false;
    } else {
      p.moving = true;
    }
    p.tx = chosen.x;
    p.ty = chosen.y;
    p.dcx = chosen.col;
    p.dcy = chosen.row;
  }

  /**
   * Emit a quad per active pedestrian. The quad is the small `vil/pedestrian`
   * billboard, clothing-tinted; `x/y` is the figure's world-px FOOT position
   * (tile-center on the road) — `pushAmbientCrowd` iso-projects that and stands
   * the sprite upright on it. Size is square (the 16px sprite is square).
   */
  quads(): QuadSpec[] {
    const out: QuadSpec[] = [];
    for (const p of this.pool) {
      if (!p.active) continue;
      // Walk-cycle bob: a small vertical hop while stepping between tiles. The
      // figure stands on `y`, so subtracting lifts it; |sin| gives a two-bounce
      // shuffle (foot never sinks below the tile). Idle pedestrians stand still.
      const bob = p.moving
        ? Math.abs(Math.sin(this.walkTime * BOB_SPEED + p.phase)) * BOB_AMPLITUDE
        : 0;
      out.push({
        // Foot position (not top-left) — the billboard is anchored bottom-centre.
        x: p.x,
        y: p.y - bob,
        width: PED_SIZE,
        height: PED_SIZE,
        tintRgba: p.tint,
        frame: FRAME_PEDESTRIAN,
      });
    }
    return out;
  }
}
