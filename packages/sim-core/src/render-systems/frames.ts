import type { GameEntity } from "../components";
import type { Season } from "../protocols/weather";
import { easeOutQuad } from "@engine/core";
import { loopClip, sampleCycle } from "./cycle";

const TILE = 16;

/** 3-frame foam animation for the water shimmer. */
export const FOAM_FRAMES = ["tile/foam-a", "tile/foam-b", "tile/foam-c"] as const;

/** 3-frame bubble animation for fishing spots. Frame -a is the base; render loop cycles A→B→C. */
export const FISHING_SPOT_FRAMES = [
  "structure/fishing-spot",
  "structure/fishing-spot-b",
  "structure/fishing-spot-c",
] as const;

/** Wall-clock cycle for the fishing-spot bubbles (sampled with a per-tile phase). */
const FISHING_SPOT_CLIP = loopClip("fishing-spot", FISHING_SPOT_FRAMES, 1200);

/**
 * Action-pose "work swing": alternate the base action pose with its `-b` strike
 * frame so a working farmer/Pip swings their tool instead of freezing on one
 * pose. Render-only, wall-clock; phase-shifted per entity so farmers desync.
 * Mirrors the NPC `*-a`/`*-b` swing cadence (brief 85, phase 2).
 */
const ACTION_SWING_HALF_MS = 220; // ms each pose holds (≈0.44s full A↔B cycle)
/** Scale punch on the action strike (the `-b` half): a brief grow that settles to 1. */
const ACTION_POP_AMP = 0.1;

// Asymmetric idle "breath": a quick lift then a slower settle, ~1.3px. Less robotic than a
// pure sine (Slynyrd) — eased via easeOutQuad, phase-shifted per entity.
const IDLE_BOB_MS = 1700;
const IDLE_BOB_AMP = 1.3;
const IDLE_BOB_RISE = 0.35; // fraction of the breath spent lifting

/** Animated forge-fire frames, cycled in the blacksmith oven's mouth. */
export const FORGE_FIRE_FRAMES = [
  "structure/forge-fire-a",
  "structure/forge-fire-b",
  "structure/forge-fire-c",
] as const;

/** Oven tile where the forge-fire overlay is drawn. */
export const FORGE_OVEN_TILE = { x: 97, y: 79 } as const;

/** 3-frame chimney smoke animation (above the forge-house). */
export const FORGE_SMOKE_FRAMES = [
  "structure/forge-smoke-a",
  "structure/forge-smoke-b",
  "structure/forge-smoke-c",
] as const;

/** Forge-house chimney top in pixel space (≈ col 11 of 32px sprite). Smoke puffs spawn here. */
export const FORGE_CHIMNEY_PX = {
  x: 99 * TILE + 11,
  y: 78 * TILE + TILE - 48 + 2,
} as const;

/** 3-frame waterfall cascade animation. A→B→C streaks step down one row (continuously falling water). */
/** Clean rock-sided cascade tiles (no foam) — stacked above the foam pool for a tall waterfall. */
export const WATERFALL_FALL_FRAMES = [
  "tile/waterfall-fall-a",
  "tile/waterfall-fall-b",
  "tile/waterfall-fall-c",
] as const;

export const WATERFALL_FRAMES = [
  "structure/waterfall-a",
  "structure/waterfall-b",
  "structure/waterfall-c",
] as const;

/** 3-frame campfire flicker animation. Wall-clock driven. */
export const CAMPFIRE_FRAMES = [
  "structure/campfire-a",
  "structure/campfire-b",
  "structure/campfire-c",
] as const;

/** 2-frame beacon blink animation (lit ↔ dim). Wall-clock driven, ~1 Hz. */
export const WEATHER_BEACON_FRAMES = [
  "structure/weather-beacon-a",
  "structure/weather-beacon-b",
] as const;

/** Beacon tip pixel position: top of antenna mast (tile 114, 119 — tip is at top of island). */
export const WEATHER_BEACON_PX = {
  x: 114 * TILE + TILE / 2,
  y: 119 * TILE + TILE / 2,
} as const;

// Must mirror PREFIX_TO_SHEET in atlas-builder (a test verifies sync).
const FRAME_PREFIX_TO_ATLAS: Readonly<Record<string, string>> = {
  "farmer":     "characters",
  "npc":        "characters",
  "structure":  "buildings",
  "tile":       "terrain",
  "crop":       "crops",
  "decoration": "props",
  "fish":       "items-ui",
  "tool":       "items-ui",
  "indicator":  "items-ui",
  "debug":      "items-ui",
  "animal":     "characters",
  "product":    "items-ui",
  "fruit":      "items-ui",
};

/** Map frame name → atlas sheet id (e.g. "tile/grass" → "terrain"). Throws on unknown prefix. */
export function frameToAtlasId(frame: string): string {
  const prefix = frame.split("/")[0];
  const sheetId = FRAME_PREFIX_TO_ATLAS[prefix ?? ""];
  if (sheetId === undefined) {
    throw new Error(
      `frameToAtlasId: unknown prefix "${prefix ?? ""}" in frame "${frame}". Update FRAME_PREFIX_TO_ATLAS.`,
    );
  }
  return sheetId;
}

/**
 * Whether a farmer/Pip is walking this tick. Drives the snapshot `moving` flag;
 * the walk-cycle frame itself is resolved render-side ([resolveFrameAndBob]) so the
 * stride is wall-clock smooth and decoupled from the tick rate (brief 85 phase 3).
 */
export function isFarmerMoving(entity: GameEntity): boolean {
  const farmer = entity.farmer;
  return farmer?.path !== undefined || farmer?.movedThisTick === true;
}

/**
 * Render-side 4-phase walk cycle for farmers/Pip: contact-a → passing → contact-b →
 * passing. The suffix tokens (`""` = the neutral passing pose) are appended to the
 * directional base frame, reusing the three existing per-facing frames (no new art).
 * Wall-clock; sampled with a per-entity phase so farmers don't march in lockstep.
 */
const WALK_CYCLE_MS = 440; // 4 × 110ms
const WALK_PHASE_MS = WALK_CYCLE_MS / 4; // 110ms per phase
// "step" fires at each contact phase (a foot plants) → footstep dust.
const WALK_CLIP = loopClip("farmer-walk", ["/walk-a", "", "/walk-b", ""], WALK_CYCLE_MS, [
  { name: "step", atMs: 0 },
  { name: "step", atMs: WALK_PHASE_MS * 2 },
]);

/**
 * Number of walk footstep "contacts" for entity `id` in the wall-clock window
 * `(prevMs, nowMs]`. The renderer turns each into a dust puff. Per-entity phase
 * matches the stride's `sampleCycle(..., id)` offset so dust lands on the foot-plant.
 */
export function walkStepsBetween(id: number, prevMs: number, nowMs: number): number {
  const off = id * WALK_PHASE_MS;
  return WALK_CLIP.eventsBetween(prevMs + off, nowMs + off).length;
}

// Action → pose suffix. Unmapped actions fall back to walk/idle animation.
export const ACTION_POSE: Record<string, string> = {
  till:          "/till",
  water:         "/water",
  "refill-can":  "/refill",
  "chop-tree":   "/chop",
  "mine-stone":  "/mine",
  plant:         "/plant",
  harvest:       "/work",   // no dedicated harvest pose
};

export type Facing = "down" | "up" | "side";

// Facing → frame segment. "down" is the bare base; the others insert a directional segment.
// One typed table instead of ad-hoc `facing === "down" ? "" : "/"+facing` string-building.
const FACING_SEG: Record<Facing, string> = { down: "", up: "/up", side: "/side" };

/**
 * Every atlas frame `resolveFrameAndBob` can emit for a farmer base ("farmer/<p>") —
 * idle/passing, the walk-cycle phases per facing, and the action poses + their `-b` strikes.
 * Single source of truth for the frame vocabulary; the atlas-existence guard test asserts
 * each of these exists in the built `characters` sheet (catches a constructed-but-missing frame).
 */
export function enumerateFarmerFrames(base: string): string[] {
  const out = new Set<string>();
  for (const seg of Object.values(FACING_SEG)) {
    const dir = base + seg;
    out.add(dir); // idle / passing pose
    for (const f of WALK_CLIP.frames) if (f.frame) out.add(dir + f.frame); // "/walk-a","/walk-b"
  }
  for (const suffix of new Set(Object.values(ACTION_POSE))) {
    out.add(base + suffix); // action pose
    out.add(base + suffix + "-b"); // strike frame
  }
  return [...out];
}

/** Foliage bases that get a 4-way seasonal look. The summer frame IS the base
 *  (no suffix); the other three seasons append a suffix. Keep in sync with the
 *  atlas recipes (structure/<base>{,-blossom,-autumn,-bare}). */
const SEASONAL_FOLIAGE_BASES: ReadonlySet<string> = new Set([
  "structure/tree",
  "structure/bush",
  "structure/fruit-tree",
  "structure/big-tree",
]);

const SEASON_FOLIAGE_SUFFIX: Record<Season, string> = {
  spring: "-blossom",
  summer: "", // base frame = the lush green / mature look
  autumn: "-autumn",
  winter: "-bare",
};

/**
 * Remap a foliage frame (tree / berry bush / orchard fruit-tree / big-tree) to its
 * seasonal variant: blossom (spring) / green (summer) / autumn / bare (winter).
 * Instant swap at the season boundary — no cross-fade. Non-foliage frames pass through.
 */
export function seasonalTreeFrame(frame: string, season: Season): string {
  if (!SEASONAL_FOLIAGE_BASES.has(frame)) return frame;
  return frame + SEASON_FOLIAGE_SUFFIX[season];
}

/** Resolve the final atlas frame, idle-bob offset, and an optional scale punch for a snapshot sprite. */
export function resolveFrameAndBob(
  s: import("../snapshot").SnapshotSprite,
  nowMs: number,
  season: Season = "spring",
): { frame: string; bobY: number; scale?: number } {
  const seasonal = seasonalTreeFrame(s.frame, season);
  if (seasonal !== s.frame) return { frame: seasonal, bobY: 0 };
  if (s.frame === "structure/fishing-spot") {
    const phase = Math.floor(s.x / TILE) * 2 + Math.floor(s.y / TILE) * 3;
    return { frame: sampleCycle(FISHING_SPOT_CLIP, nowMs, phase), bobY: 0 };
  }
  if (s.id === null) return { frame: s.frame, bobY: 0 };

  if (s.frame.startsWith("npc/") || !s.frame.startsWith("farmer/")) {
    return { frame: s.frame, bobY: 0 };
  }

  // The snapshot carries the base look ("farmer/<p>"); facing + walk are resolved here.
  const base = s.frame;

  if (s.action !== null && s.action in ACTION_POSE) {
    const pose = base + ACTION_POSE[s.action];
    // Toggle pose ↔ pose-b on the wall clock; per-entity phase so farmers don't sync.
    const useB = (Math.floor(nowMs / ACTION_SWING_HALF_MS) + (s.id ?? 0)) % 2 === 1;
    // Scale punch on the strike: peak at the start of the -b half, settle to 1 across it.
    const q = (nowMs % ACTION_SWING_HALF_MS) / ACTION_SWING_HALF_MS;
    const scale = useB ? 1 + ACTION_POP_AMP * (1 - easeOutQuad(q)) : 1;
    return { frame: useB ? `${pose}-b` : pose, bobY: 0, scale };
  }

  const facing: Facing = s.facing ?? "down";
  const dir = base + FACING_SEG[facing];

  if (s.moving === true) {
    // 4-phase stride via the walk clip; "" phases hold the neutral passing pose.
    return { frame: dir + sampleCycle(WALK_CLIP, nowMs, s.id ?? 0), bobY: 0 };
  }

  // Asymmetric idle breath: quick lift (eased), slower settle; negative = up.
  const p = (((nowMs / IDLE_BOB_MS) + (s.id ?? 0) * 0.21) % 1 + 1) % 1;
  const tri = p < IDLE_BOB_RISE ? p / IDLE_BOB_RISE : 1 - (p - IDLE_BOB_RISE) / (1 - IDLE_BOB_RISE);
  const bobY = -easeOutQuad(tri) * IDLE_BOB_AMP;
  return { frame: dir, bobY };
}
