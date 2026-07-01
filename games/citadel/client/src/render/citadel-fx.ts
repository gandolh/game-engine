/**
 * Citadel render-side juice (briefs 17 + 19). All **render-only**, off-sim:
 *
 *  - Placement ease-in (brief 17): a newly-appeared building tweens scale
 *    0.6→1.0 + alpha 0→1 over <200ms (ease-out), scaled about its footprint
 *    centre. Driven by an appear-timestamp map keyed by `x,y,type`.
 *  - Idle bob (brief 17): each villager's quad gets a small vertical sine bob,
 *    phase-offset per id so they don't bob in lockstep.
 *  - Chimney smoke (brief 17): small rising EDG-grey particles anchored to
 *    bakery / smith / woodcutter, emitted into the engine `ParticleSystem`
 *    (rendered natively by the WebGPU backend's particle pass). Capped.
 *  - Follow-cam (brief 19): pure "nearest villager within radius" pick + a
 *    "release if the followed id despawned" predicate. The camera glide
 *    (`expSmooth`) and the DOM HUD strip live in main.ts.
 *
 * Tree sway from the brief is intentionally SKIPPED: Citadel forests are baked
 * terrain (no per-tree sprite to sway), so there is nothing to animate.
 *
 * The pure helpers (placementScale / bobOffset / nearestVillager /
 * followReleaseId) never touch the GPU and are unit-tested headlessly. Smoke is
 * the only stateful piece (it owns a render-side RNG only to jitter emit
 * timing — never the sim RNG, never Math.random in sim-construable code).
 */
import { EDG } from "@engine/core";
import type { ParticleSystem, Rng } from "@engine/core";
import { TILE_SIZE } from "@citadel/sim-core";
import type { BuildingSnapshot, VillagerSnapshot } from "@citadel/sim-core";
import { villagerQuad, type QuadSpec } from "./citadel-renderer";

// ---------------------------------------------------------------------------
// Placement ease-in (pure, tested)
// ---------------------------------------------------------------------------

/** Tween duration for the placement ease-in, in ms. */
export const PLACEMENT_EASE_MS = 200;
/** Scale a freshly-placed building starts at (grows to 1.0). */
export const PLACEMENT_MIN_SCALE = 0.6;

/** The scale + alpha multipliers a placement-ease tween applies to a quad. */
export interface PlacementFx {
  /** Footprint scale factor about the centre (PLACEMENT_MIN_SCALE..1). */
  scale: number;
  /** Alpha multiplier (0..1). */
  alpha: number;
}

/**
 * Ease-out cubic placement tween. `ageMs` is how long the building has existed
 * (render clock). At 0ms it is small + transparent; at ≥PLACEMENT_EASE_MS it is
 * settled (scale 1, alpha 1). Pure + total (clamps negative/over-long ages).
 */
export function placementScale(ageMs: number): PlacementFx {
  if (ageMs >= PLACEMENT_EASE_MS) return { scale: 1, alpha: 1 };
  const t = Math.max(0, ageMs) / PLACEMENT_EASE_MS; // 0..1
  // Ease-out cubic: fast start, gentle settle.
  const eased = 1 - Math.pow(1 - t, 3);
  return {
    scale: PLACEMENT_MIN_SCALE + (1 - PLACEMENT_MIN_SCALE) * eased,
    alpha: eased,
  };
}

/** Stable key for a building instance in the appear-timestamp map. */
export function buildingKey(b: Pick<BuildingSnapshot, "x" | "y" | "type">): string {
  return `${b.x},${b.y},${b.type}`;
}

/**
 * Diff this frame's buildings against the appear-timestamp map, recording a
 * `nowMs` timestamp for any building key not seen before, and dropping keys for
 * buildings that no longer exist (so demolish→rebuild re-triggers the ease).
 * Mutates `appearAt` in place. Render-only — no sim, no RNG.
 */
export function syncAppearMap(
  appearAt: Map<string, number>,
  buildings: readonly BuildingSnapshot[],
  nowMs: number,
): void {
  const present = new Set<string>();
  for (const b of buildings) {
    const key = buildingKey(b);
    present.add(key);
    if (!appearAt.has(key)) appearAt.set(key, nowMs);
  }
  for (const key of appearAt.keys()) {
    if (!present.has(key)) appearAt.delete(key);
  }
}

/**
 * Apply a placement-ease `PlacementFx` to a building's quad: scale its footprint
 * about its centre. Alpha is returned separately (QuadSpec has no alpha — the
 * sprite layer carries it). Pure.
 */
export function easeQuad(q: QuadSpec, fx: PlacementFx): QuadSpec {
  const cx = q.x + q.width / 2;
  const cy = q.y + q.height / 2;
  const w = q.width * fx.scale;
  const h = q.height * fx.scale;
  // Preserve `frame` so a building keeps its sprite (not the white `px` box)
  // through the placement ease-in. Conditional spread keeps it absent (not
  // `undefined`) under exactOptionalPropertyTypes.
  return {
    x: cx - w / 2,
    y: cy - h / 2,
    width: w,
    height: h,
    tintRgba: q.tintRgba,
    ...(q.frame !== undefined ? { frame: q.frame } : {}),
  };
}

// ---------------------------------------------------------------------------
// Idle bob (pure, tested)
// ---------------------------------------------------------------------------

/** Bob amplitude in world px (a couple of px). */
export const BOB_AMPLITUDE_PX = 1.5;
/** Bob angular frequency (rad/s). */
export const BOB_OMEGA = 3.2;

/** Per-id phase so villagers don't bob in lockstep. Pure, deterministic. */
export function bobPhase(id: number): number {
  // Cheap integer hash → [0, 2π). Distinct odd multiplier + xorshift finalize.
  let h = Math.imul(id ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = h >>> 0;
  return (h / 0xffffffff) * Math.PI * 2;
}

/**
 * Vertical bob offset (world px) for villager `id` at `timeSec`. Bounded by
 * ±BOB_AMPLITUDE_PX; phase-offset per id. Pure + deterministic (no RNG).
 */
export function bobOffset(timeSec: number, id: number): number {
  return Math.sin(timeSec * BOB_OMEGA + bobPhase(id)) * BOB_AMPLITUDE_PX;
}

/** Walk-gait cadence: faster than the idle sway so a step reads as a step. */
export const WALK_OMEGA = 8.5;
/** Walk-gait bob amplitude (world px) — a bit springier than the idle sway. */
export const WALK_AMPLITUDE_PX = 2.4;

/**
 * Movement-aware vertical bob. A WALKING villager gets a faster, springier step
 * cadence (a `|sin|` hop — feet down twice per stride, always ≥0 so the figure
 * rises off the ground rather than sinking into it); an idle villager keeps the
 * gentle ±sway from {@link bobOffset}. Phase-offset per id so a crowd doesn't
 * march in lockstep. Pure + deterministic (no RNG, render clock only).
 */
export function gaitOffset(timeSec: number, id: number, moving: boolean): number {
  if (!moving) return bobOffset(timeSec, id);
  // |sin| gives a 2-per-cycle hop that never dips below the ground line.
  return Math.abs(Math.sin(timeSec * WALK_OMEGA + bobPhase(id))) * WALK_AMPLITUDE_PX;
}

/** Villager quad with the idle bob applied to Y. Pure. */
export function bobbedVillagerQuad(v: VillagerSnapshot, timeSec: number): QuadSpec {
  const q = villagerQuad(v);
  return { ...q, y: q.y + bobOffset(timeSec, v.id) };
}

// ---------------------------------------------------------------------------
// Follow-cam pure helpers (brief 19)
// ---------------------------------------------------------------------------

/** Default pick radius for the right-click follow hit-test, in tiles. */
export const FOLLOW_PICK_RADIUS_TILES = 1;

/**
 * Pick the nearest villager to a tile (tx,ty) within `radiusTiles`. Returns the
 * villager id, or null if none is within range. Distance is in tile units
 * (villager x/y are tile coords). Pure — given the list + tile, deterministic.
 */
export function nearestVillager(
  villagers: readonly VillagerSnapshot[],
  tx: number,
  ty: number,
  radiusTiles = FOLLOW_PICK_RADIUS_TILES,
): number | null {
  let bestId: number | null = null;
  let bestD2 = radiusTiles * radiusTiles;
  for (const v of villagers) {
    const dx = v.x - tx;
    const dy = v.y - ty;
    const d2 = dx * dx + dy * dy;
    if (d2 <= bestD2) {
      bestD2 = d2;
      bestId = v.id;
    }
  }
  return bestId;
}

/**
 * Resolve the follow id against the latest villager list: keep it if the
 * followed villager still exists, else null (it despawned — e.g. night /
 * starvation → release the follow). Pure predicate.
 */
export function followReleaseId(
  followId: number | null,
  villagers: readonly VillagerSnapshot[],
): number | null {
  if (followId === null) return null;
  for (const v of villagers) if (v.id === followId) return followId;
  return null;
}

/** Find the followed villager in the list (or null). Pure. */
export function villagerById(
  villagers: readonly VillagerSnapshot[],
  id: number,
): VillagerSnapshot | null {
  for (const v of villagers) if (v.id === id) return v;
  return null;
}

// ---------------------------------------------------------------------------
// House mood → diegetic cues (pure, tested) — Phase A cozy pivot
// ---------------------------------------------------------------------------
//
// A player should read a house's wellbeing WITHOUT opening an overlay:
//  - well-served (high `mood`) houses glow warm + breathe a cozy hearth wisp;
//  - neglected (low `mood`) houses sit dim/cool with no smoke.
// `mood` is 0..100 (house-meaningful; non-houses default 40). These helpers map
// that scalar to the render cues and are unit-tested headlessly — they never
// touch the GPU (the renderer/smoke emitter consume them).

/** Mood (0..100) at/above which a happy house glows at full warm strength. */
export const MOOD_GLOW_FULL = 80;
/** Mood (0..100) at/below which a house's warm glow is fully extinguished. */
export const MOOD_GLOW_NONE = 40;
/** Peak warm-glow alpha multiplier (0..1) at MOOD_GLOW_FULL. Subtle by design. */
export const MOOD_GLOW_MAX_ALPHA = 0.3;

/**
 * Warm light-pool alpha (0..1) for a house of the given `mood`. Zero at/below
 * MOOD_GLOW_NONE (a neglected hearth is cold/dark), ramping linearly up to
 * MOOD_GLOW_MAX_ALPHA at/above MOOD_GLOW_FULL. Pure + total (clamps any range).
 * Monotonic non-decreasing in `mood`.
 */
export function glowAlphaForMood(mood: number): number {
  if (mood <= MOOD_GLOW_NONE) return 0;
  if (mood >= MOOD_GLOW_FULL) return MOOD_GLOW_MAX_ALPHA;
  const t = (mood - MOOD_GLOW_NONE) / (MOOD_GLOW_FULL - MOOD_GLOW_NONE); // 0..1
  return t * MOOD_GLOW_MAX_ALPHA;
}

/** Mood (0..100) at/above which a house keeps full sprite brightness. */
export const MOOD_DIM_FULL = 50;
/** Mood (0..100) at/below which a neglected house reads its dimmest. */
export const MOOD_DIM_NONE = 10;
/** How far a fully-neglected house's sprite alpha drops from 1 (cold/untended). */
export const MOOD_DIM_MAX = 0.35;

/**
 * Sprite alpha multiplier (MOOD_DIM_MIN..1) for a house of the given `mood`. A
 * neglected house (low mood) reads dimmer/cooler; a content house stays full.
 * 1.0 at/above MOOD_DIM_FULL, dropping linearly to (1 - MOOD_DIM_MAX) at/below
 * MOOD_DIM_NONE. Pure + total; monotonic non-decreasing in `mood`.
 */
export function houseAlphaForMood(mood: number): number {
  if (mood >= MOOD_DIM_FULL) return 1;
  if (mood <= MOOD_DIM_NONE) return 1 - MOOD_DIM_MAX;
  const t = (mood - MOOD_DIM_NONE) / (MOOD_DIM_FULL - MOOD_DIM_NONE); // 0..1
  return 1 - MOOD_DIM_MAX * (1 - t);
}

/** Mood (0..100) at/above which a house emits a gentle hearth-smoke wisp. */
export const MOOD_HEARTH_SMOKE = 65;

/**
 * How far a fully-glum villager's sprite alpha drops from 1. Gentler than
 * MOOD_DIM_MAX (houses): villager sprites are small, so a big dip would hurt
 * legibility of the (primary) job-color read. Reuses the house curve's
 * MOOD_DIM_FULL/MOOD_DIM_NONE breakpoints for a consistent mood "feel" across
 * cues — only the max drop differs.
 */
export const VILLAGER_MOOD_DIM_MAX = 0.25;

/**
 * Sprite alpha multiplier ((1 - VILLAGER_MOOD_DIM_MAX)..1) for a villager of the
 * given `mood`. A glum villager (low mood) reads subtly dimmer/cooler than a
 * content one; job tint stays the primary read. Same breakpoints as
 * {@link houseAlphaForMood} (MOOD_DIM_FULL/MOOD_DIM_NONE), scaled to the
 * gentler VILLAGER_MOOD_DIM_MAX ceiling. Pure + total; monotonic
 * non-decreasing in `mood`.
 */
export function villagerAlphaForMood(mood: number): number {
  if (mood >= MOOD_DIM_FULL) return 1;
  if (mood <= MOOD_DIM_NONE) return 1 - VILLAGER_MOOD_DIM_MAX;
  const t = (mood - MOOD_DIM_NONE) / (MOOD_DIM_FULL - MOOD_DIM_NONE); // 0..1
  return 1 - VILLAGER_MOOD_DIM_MAX * (1 - t);
}

/** Peak downward "slump" offset (world px) for a fully-glum villager. Tiny by design. */
export const VILLAGER_SLUMP_PX = 1.5;

/**
 * Vertical slump offset (world px, 0..VILLAGER_SLUMP_PX) for a villager of the
 * given `mood` — a glum villager sits a hair lower/heavier than a content one.
 * Same MOOD_DIM_FULL/MOOD_DIM_NONE breakpoints as the alpha cue. Pure, total,
 * deterministic (no render clock — this is a steady mood read, not an
 * animation); monotonic non-increasing in `mood`.
 */
export function villagerSlumpOffset(mood: number): number {
  if (mood >= MOOD_DIM_FULL) return 0;
  if (mood <= MOOD_DIM_NONE) return VILLAGER_SLUMP_PX;
  const t = (mood - MOOD_DIM_NONE) / (MOOD_DIM_FULL - MOOD_DIM_NONE); // 0..1
  return VILLAGER_SLUMP_PX * (1 - t);
}

/**
 * Does a house of the given `mood` breathe a cozy hearth wisp? Only content
 * houses (mood ≥ MOOD_HEARTH_SMOKE) do; neglected ones stay smokeless. Pure.
 */
export function houseEmitsHearthSmoke(mood: number): boolean {
  return mood >= MOOD_HEARTH_SMOKE;
}

// ---------------------------------------------------------------------------
// Chimney smoke (stateful — owns a render-side RNG, never the sim's)
// ---------------------------------------------------------------------------

/** Building types that emit chimney smoke. */
export const SMOKE_BUILDINGS: ReadonlySet<string> = new Set(["bakery", "smith", "woodcutter"]);

/** Smoke greys (EDG). */
const SMOKE_COLOR = EDG.silver;
const SMOKE_COLOR2 = EDG.slate;
/** Warm hearth-wisp tint (EDG) — smoke catching the fireside glow. */
const HEARTH_COLOR = EDG.cream;

/**
 * Capped chimney-smoke emitter. Drips a few rising grey particles per emitter
 * building on a fixed render-clock cadence, jittered by a render-side RNG so the
 * plumes don't pulse in lockstep. The shared `ParticleSystem` itself caps at its
 * own MAX_PARTICLES (512); we additionally throttle emission cadence + count so
 * smoke never floods the pool and starves other FX.
 *
 * Emit coords are WORLD px (the WebGPU particle pass renders in world space, via
 * the same view transform as sprites) so smoke tracks the camera correctly.
 */
export class CitadelSmoke {
  private readonly particles: ParticleSystem;
  private readonly rng: Rng;
  /** Per-emitter next-emit render-clock time (ms), keyed by building key. */
  private readonly nextEmitAt = new Map<string, number>();
  /** Base cadence between puffs per chimney (ms); jittered ±50%. */
  private readonly cadenceMs = 420;
  /** Hard cap on industrial-chimney emitter buildings considered per frame. */
  private readonly maxEmitters = 24;
  /**
   * Cozy hearth cadence (ms): a content house breathes far slower than an
   * industrial chimney, so it reads as a fireside wisp, not a factory plume.
   */
  private readonly hearthCadenceMs = 1500;
  /**
   * Separate, tighter cap on hearth emitters per frame (there can be MANY
   * houses — keep the particle pool from being swamped by cozy wisps).
   */
  private readonly maxHearthEmitters = 16;

  constructor(particles: ParticleSystem, rng: Rng) {
    this.particles = particles;
    this.rng = rng;
  }

  /**
   * Advance smoke: for each bakery/smith/woodcutter due for a puff, emit a small
   * rising grey plume from its roof. `nowMs` is the render clock. Off-sim.
   */
  update(buildings: readonly BuildingSnapshot[], nowMs: number): void {
    const present = new Set<string>();
    let considered = 0; // industrial chimneys this frame
    let hearths = 0; // cozy house hearths this frame
    // Loop scans all buildings (no early break) so both industrial and hearth
    // emitters are considered independently up to their own caps.
    for (const b of buildings) {
      // A building emits EITHER an industrial chimney plume (bakery/smith/…) OR,
      // if it's a content house, a gentle hearth wisp — never both. Each path
      // keeps its own per-frame cap so neither floods the shared particle pool.
      const isChimney = SMOKE_BUILDINGS.has(b.type);
      const isHearth = b.type === "house" && houseEmitsHearthSmoke(b.mood);
      if (!isChimney && !isHearth) continue;
      if (isChimney && considered >= this.maxEmitters) continue;
      if (isHearth && hearths >= this.maxHearthEmitters) continue;
      if (isChimney) considered++;
      else hearths++;

      const cadence = isChimney ? this.cadenceMs : this.hearthCadenceMs;
      const key = buildingKey(b);
      present.add(key);
      const due = this.nextEmitAt.get(key);
      if (due === undefined) {
        // Stagger first puff so emitters don't all fire on frame 1.
        this.nextEmitAt.set(key, nowMs + this.rng.nextFloat() * cadence);
        continue;
      }
      if (nowMs >= due) {
        if (isChimney) this.emitPuff(b);
        else this.emitHearthPuff(b);
        const jitter = (0.75 + this.rng.nextFloat() * 0.5) * cadence;
        this.nextEmitAt.set(key, nowMs + jitter);
      }
    }
    // Drop bookkeeping for demolished emitters (and houses that fell below the
    // hearth-smoke mood threshold — they stop being `present`, so they age out).
    for (const key of this.nextEmitAt.keys()) {
      if (!present.has(key)) this.nextEmitAt.delete(key);
    }
  }

  private emitPuff(b: BuildingSnapshot): void {
    // Roof anchor: top-centre of the footprint, in world px.
    const cx = (b.x + b.w / 2) * TILE_SIZE;
    const top = b.y * TILE_SIZE + TILE_SIZE * 0.1;
    this.particles.emit({
      x: cx,
      y: top,
      count: 2,
      shape: "circle",
      color: SMOKE_COLOR,
      color2: SMOKE_COLOR2,
      // Drift up + slightly outward; gravity slightly negative for a lazy rise.
      speedMin: 4,
      speedMax: 10,
      angleMin: -Math.PI * 0.62, // up-and-leftish
      angleMax: -Math.PI * 0.38, // up-and-rightish
      lifetimeMin: 1.2,
      lifetimeMax: 2.2,
      sizeMin: 1,
      sizeMax: 2.2,
      gravity: -6,
    });
  }

  /**
   * A single small, slow, warm-tinted wisp from a content house's roof — a cozy
   * hearth, not a factory. One particle (vs the chimney's two), a gentler rise,
   * and a firelit cream→grey fade so it reads as smoke catching the hearth glow.
   */
  private emitHearthPuff(b: BuildingSnapshot): void {
    const cx = (b.x + b.w / 2) * TILE_SIZE;
    const top = b.y * TILE_SIZE + TILE_SIZE * 0.1;
    this.particles.emit({
      x: cx,
      y: top,
      count: 1,
      shape: "circle",
      color: HEARTH_COLOR,
      color2: SMOKE_COLOR,
      // Slower, lazier rise than a chimney; tight upward cone.
      speedMin: 2,
      speedMax: 6,
      angleMin: -Math.PI * 0.58,
      angleMax: -Math.PI * 0.42,
      lifetimeMin: 1.4,
      lifetimeMax: 2.6,
      sizeMin: 0.8,
      sizeMax: 1.6,
      gravity: -5,
    });
  }
}
