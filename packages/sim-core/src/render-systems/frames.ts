import type { GameEntity } from "../components";
import type { Season } from "../protocols/weather";
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
 * Action-pose "work swing": a small downward dip oscillating while a farmer/Pip
 * performs a physical action, so the static work pose visibly works instead of
 * freezing. Render-only; phase-shifted per entity. Faster + larger than idle bob.
 * Interim until per-action `-a/-b` frames land (brief 85, phase 2).
 */
const ACTION_SWING_PERIOD = 110; // ms factor (≈0.7s cycle) — quicker than the idle bob
const ACTION_SWING_AMP = 2.5; // px downward dip

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

/** Walk-cycle frame for a farmer. Alternates walk-a/b every 2 ticks while traveling. */
export function pickFarmerFrame(entity: GameEntity, tick: number): string {
  const farmer = entity.farmer;
  const baseFrame = entity.sprite?.frame ?? "";
  const walking = farmer?.path !== undefined || farmer?.movedThisTick === true;
  if (!walking) return baseFrame;
  const suffix = (tick >> 1) & 1 ? "/walk-b" : "/walk-a";
  return baseFrame + suffix;
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

/** Remap `structure/tree` to the seasonal variant frame. Other frames pass through. */
export function seasonalTreeFrame(frame: string, season: Season): string {
  if (frame !== "structure/tree") return frame;
  if (season === "autumn") return "structure/tree-autumn";
  if (season === "winter") return "structure/tree-bare";
  return frame; // spring/summer keep the green tree
}

/** Resolve the final atlas frame and idle-bob offset for a snapshot sprite. */
export function resolveFrameAndBob(
  s: import("../snapshot").SnapshotSprite,
  nowMs: number,
  season: Season = "spring",
): { frame: string; bobY: number } {
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

  const walkMatch = /\/walk-[ab]$/.exec(s.frame);
  const isWalking = walkMatch !== null;
  const walkSuffix = walkMatch ? walkMatch[0] : "";
  const base = s.frame.replace(/\/walk-[ab]$/, ""); // e.g. "farmer/hoarder"

  if (s.action !== null && s.action in ACTION_POSE) {
    // Half-rectified cosine → a 0..AMP downward dip (a repeated "work strike").
    const phase = (s.id ?? 0) * 1.7;
    const swing = (0.5 - 0.5 * Math.cos(nowMs / ACTION_SWING_PERIOD + phase)) * ACTION_SWING_AMP;
    return { frame: base + ACTION_POSE[s.action], bobY: swing };
  }

  // "down" = base frame; "up"/"side" insert a facing segment.
  const facing = s.facing ?? "down";
  const dirSeg = facing === "down" ? "" : `/${facing}`;
  const frame = base + dirSeg + walkSuffix;

  const bobY = isWalking ? 0 : Math.sin(nowMs / 600 + (s.id ?? 0) * 1.3) * 1.5;
  return { frame, bobY };
}
