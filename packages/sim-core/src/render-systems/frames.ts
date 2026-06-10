/**
 * render-systems/frames.ts — atlas routing, frame selection, and animation
 * helpers for both static and snapshot sprites.
 */

import type { GameEntity } from "../components";
import type { Season } from "../protocols/weather";

const TILE = 16;

/** The three animated foam frames, cycled for the water shimmer. */
export const FOAM_FRAMES = ["tile/foam-a", "tile/foam-b", "tile/foam-c"] as const;

/**
 * The fishing-spot rising-bubble animation: 3 frames the render loop cycles
 * (A→B→C) so the spot's three bubbles climb to the surface and pop. `-a` is the
 * `structure/fishing-spot` frame the BubbleSystem spawns / the snapshot carries;
 * the render loop swaps the displayed frame to animate it (see main.ts).
 */
export const FISHING_SPOT_FRAMES = [
  "structure/fishing-spot",
  "structure/fishing-spot-b",
  "structure/fishing-spot-c",
] as const;

/** Animated forge-fire frames, cycled in the blacksmith oven's mouth. */
export const FORGE_FIRE_FRAMES = [
  "structure/forge-fire-a",
  "structure/forge-fire-b",
  "structure/forge-fire-c",
] as const;

/** Tile of the blacksmith oven (matches region-setup placeProps). The fire
 *  overlay is drawn here, above the oven body. */
export const FORGE_OVEN_TILE = { x: 97, y: 79 } as const;

/** Animated forge chimney-smoke frames, cycled by the render loop above the
 *  forge-house (see FORGE_CHIMNEY_PX). */
export const FORGE_SMOKE_FRAMES = [
  "structure/forge-smoke-a",
  "structure/forge-smoke-b",
  "structure/forge-smoke-c",
] as const;

/** The forge-house chimney top, in pixel space — where smoke puffs spawn. The
 *  chimney is at recipe column ~11 of the 32px sprite, top at the sprite's top
 *  (≈ baseTileY*TILE + TILE - hPx). Used by the animated smoke overlay in main. */
export const FORGE_CHIMNEY_PX = {
  x: 99 * TILE + 11,
  y: 78 * TILE + TILE - 48 + 2,
} as const;

/**
 * brief 52 — animated waterfall-cascade frames, cycled by the render loop on top
 * of the static `structure/waterfall` base (the cliff). Across A→B→C the bright
 * water-blue streaks step DOWN a row so the column reads as continuously falling
 * water. Wall-clock driven (no determinism impact), exactly like FORGE_FIRE_FRAMES.
 */
export const WATERFALL_FRAMES = [
  "structure/waterfall-a",
  "structure/waterfall-b",
  "structure/waterfall-c",
] as const;

/**
 * brief 54 — animated campfire-flame frames, cycled by the render loop on top of
 * the static `structure/campfire` base (the stone ring + logs) at the camping
 * island. Across A→B→C the flame shape + brightness vary for a simple flicker.
 * Wall-clock driven (no determinism impact), exactly like FORGE_FIRE_FRAMES.
 */
export const CAMPFIRE_FRAMES = [
  "structure/campfire-a",
  "structure/campfire-b",
  "structure/campfire-c",
] as const;

// ── Atlas sheet routing ───────────────────────────────────────────────────────
// Mirrors PREFIX_TO_SHEET in tools/atlas-builder/src/recipes/sheet-map.ts.
// Keep in sync when adding new frame prefixes.
// Design decision: the mapping lives here (runtime) AND in the builder because
// the builder emits the sheets and the runtime routes sprites to them; sharing
// a single source would require the game to import builder code or vice versa
// (both illegal in this monorepo). A build-time test in atlas-builder verifies
// the sets stay consistent.
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
  // brief 42 — livestock + orchard
  "animal":     "characters",
  "product":    "items-ui",
  "fruit":      "items-ui",
};

/**
 * Derive the atlas sheet id for a sprite frame name (e.g. "tile/grass" →
 * "terrain"). Throws if the frame prefix is not mapped so misconfigurations
 * surface immediately rather than producing a silent rendering glitch.
 *
 * Centralised here so every sprite — static backdrop (buildStaticLayerSprites),
 * snapshot (snapshot-builder.ts buildSprites), and dynamic meet-indicator —
 * sets atlasId from the same authoritative mapping.
 */
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
 * Pick the sprite frame for a farmer entity given the current simulation tick.
 * While `farmer.path` is set (traveling), the frame alternates between walk-a
 * and walk-b every 2 ticks (~100ms at 20 Hz). When idle the base personality
 * frame is returned unchanged.
 *
 * Extracted as a top-level helper so concurrent diffs in the sprite loop can
 * merge mechanically without touching this logic.
 */
export function pickFarmerFrame(entity: GameEntity, tick: number): string {
  const farmer = entity.farmer;
  const baseFrame = entity.sprite?.frame ?? "";
  // AI farmers walk while traveling a path; the player (Pip) has no path, so it
  // walks while it stepped this tick (set by PlayerControlSystem).
  const walking = farmer?.path !== undefined || farmer?.movedThisTick === true;
  if (!walking) return baseFrame;
  const suffix = (tick >> 1) & 1 ? "/walk-b" : "/walk-a";
  return baseFrame + suffix;
}

// Maps each farmer action kind to the atlas pose suffix to use while performing it.
// Actions not in this map fall back to the normal walk/idle animation.
export const ACTION_POSE: Record<string, string> = {
  till:          "/till",
  water:         "/water",
  "refill-can":  "/refill",
  "chop-tree":   "/chop",
  "mine-stone":  "/mine",
  plant:         "/plant",
  harvest:       "/work",   // harvest has no dedicated pose — use generic work
};

/**
 * brief 45 — seasonal foliage remap for static feature trees (render-only).
 * The sim spawns farm/orchard trees with `structure/tree`; in autumn/winter we
 * swap the displayed frame to the season variant so the world reads as the same
 * trees changing through the year. Other frames pass through unchanged.
 */
export function seasonalTreeFrame(frame: string, season: Season): string {
  if (frame !== "structure/tree") return frame;
  if (season === "autumn") return "structure/tree-autumn";
  if (season === "winter") return "structure/tree-bare";
  return frame; // spring/summer keep the green tree
}

/**
 * Pick the final atlas frame for a snapshot sprite, applying:
 *  - a distinct action pose when the farmer is performing a physical action
 *  - idle bob offset (returned separately as `bobY`) when standing still
 *
 * The base frame carried on the sprite is stripped of any trailing walk suffix
 * before the action pose suffix is appended, so mid-walk action events resolve
 * cleanly to the correct personality frame (e.g. `farmer/hoarder/till`).
 */
export function resolveFrameAndBob(
  s: import("../snapshot").SnapshotSprite,
  nowMs: number,
  season: Season = "spring",
): { frame: string; bobY: number } {
  // Seasonal feature-tree remap (applies before any pose/walk logic; trees are
  // id-less static features so they hit the early `s.id === null` return below).
  const seasonal = seasonalTreeFrame(s.frame, season);
  if (seasonal !== s.frame) return { frame: seasonal, bobY: 0 };
  // Fishing spots: animate the three rising bubbles by cycling A→B→C (~1.2 s),
  // with a per-tile phase offset (off the pixel position) so neighbouring spots
  // don't bubble in lockstep. Wall-clock driven (nowMs) — purely cosmetic; the
  // spot's tile position still comes from the seeded BubbleSystem snapshot.
  if (s.frame === "structure/fishing-spot") {
    const SPOT_PERIOD_MS = 1200;
    const step = nowMs / (SPOT_PERIOD_MS / FISHING_SPOT_FRAMES.length);
    const phase = Math.floor(s.x / TILE) * 2 + Math.floor(s.y / TILE) * 3;
    const frame = FISHING_SPOT_FRAMES[(Math.floor(step) + phase) % FISHING_SPOT_FRAMES.length]!;
    return { frame, bobY: 0 };
  }
  if (s.id === null) return { frame: s.frame, bobY: 0 };

  // NPC pose frames (e.g. "npc/blacksmith/hammer-a") are already fully resolved
  // worker-side, as is the NPC's non-directional idle (the structure sprite).
  if (s.frame.startsWith("npc/") || !s.frame.startsWith("farmer/")) {
    return { frame: s.frame, bobY: 0 };
  }

  // Split the worker-sent farmer frame into its base personality frame and a
  // walking flag (the worker appends /walk-a|b while traveling).
  const walkMatch = /\/walk-[ab]$/.exec(s.frame);
  const isWalking = walkMatch !== null;
  const walkSuffix = walkMatch ? walkMatch[0] : "";
  const base = s.frame.replace(/\/walk-[ab]$/, ""); // e.g. "farmer/hoarder"

  // Action pose takes priority and is authored front-facing only (brief, OK).
  if (s.action !== null && s.action in ACTION_POSE) {
    return { frame: base + ACTION_POSE[s.action], bobY: 0 };
  }

  // Apply 3-way facing. "down" is the base frame (no facing segment); "up"/
  // "side" insert a facing segment before any walk suffix.
  const facing = s.facing ?? "down";
  const dirSeg = facing === "down" ? "" : `/${facing}`;
  const frame = base + dirSeg + walkSuffix;

  // Idle bob: 1.5px vertical sine oscillation (each farmer offset by id).
  const bobY = isWalking ? 0 : Math.sin(nowMs / 600 + (s.id ?? 0) * 1.3) * 1.5;
  return { frame, bobY };
}
