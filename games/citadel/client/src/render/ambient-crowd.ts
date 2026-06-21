/**
 * Citadel ambient crowd (brief 18) — a thin procedural pedestrian decoration
 * layer. These are NOT ECS entities and NEVER touch the sim: they are
 * render-only, driven by a render-side RNG seeded off a fixed CONSTANT (never
 * `state.rng`, never the sim sequence), so they have zero determinism impact.
 *
 * Pedestrians wander between road tiles derived from the building snapshot
 * (safer than arbitrary floor tiles — guarantees they stay on walkable ground).
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

interface Pedestrian {
  active: boolean;
  /** Current world-px position. */
  x: number;
  y: number;
  /** Destination world-px (a road tile center). */
  tx: number;
  ty: number;
  speed: number;
  tint: number;
}

/** A walkable target: the center (world-px) of a road tile. */
interface RoadPoint {
  x: number;
  y: number;
}

/** Pull road-tile centers (world-px) out of a building snapshot. Pure-ish. */
function roadPointsOf(buildings: readonly BuildingSnapshot[]): RoadPoint[] {
  const pts: RoadPoint[] = [];
  for (const b of buildings) {
    // Roads/gates/markets/wells are the natural gathering/wander targets; roads
    // are the spine. Treat road + gate tiles as walkable points.
    if (b.type !== "road" && b.type !== "gate") continue;
    for (let dy = 0; dy < b.h; dy++) {
      for (let dx = 0; dx < b.w; dx++) {
        pts.push({ x: (b.x + dx + 0.5) * TILE_SIZE, y: (b.y + dy + 0.5) * TILE_SIZE });
      }
    }
  }
  return pts;
}

export class CitadelAmbientCrowd {
  private readonly rng: Rng;
  private readonly pool: Pedestrian[] = [];
  private roads: RoadPoint[] = [];

  constructor(seed: number = CROWD_RENDER_SEED) {
    this.rng = createRng(seed >>> 0);
    for (let i = 0; i < CROWD_CAP; i++) {
      this.pool.push({
        active: false,
        x: 0,
        y: 0,
        tx: 0,
        ty: 0,
        speed: SPEED_MIN,
        tint: packTint(PED_COLORS[i % PED_COLORS.length]!),
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
    this.roads = roadPointsOf(snapshot.buildings);

    // No walkable ground (very early game) → retire everyone, nothing to do.
    if (this.roads.length === 0) {
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

    // Advance active pedestrians toward their targets; retarget on arrival.
    for (const p of this.pool) {
      if (!p.active) continue;
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const dist = Math.hypot(dx, dy);
      const step = p.speed * dt;
      if (dist <= step || dist < 0.5) {
        p.x = p.tx;
        p.y = p.ty;
        this.retarget(p);
      } else {
        p.x += (dx / dist) * step;
        p.y += (dy / dist) * step;
      }
    }
  }

  private spawn(p: Pedestrian): void {
    const start = this.roads[this.rng.int(0, this.roads.length)]!;
    p.active = true;
    p.x = start.x;
    p.y = start.y;
    p.speed = this.rng.range(SPEED_MIN, SPEED_MAX);
    this.retarget(p);
  }

  private retarget(p: Pedestrian): void {
    const dest = this.roads[this.rng.int(0, this.roads.length)]!;
    p.tx = dest.x;
    p.ty = dest.y;
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
      out.push({
        // Foot position (not top-left) — the billboard is anchored bottom-centre.
        x: p.x,
        y: p.y,
        width: PED_SIZE,
        height: PED_SIZE,
        tintRgba: p.tint,
        frame: FRAME_PEDESTRIAN,
      });
    }
    return out;
  }
}
