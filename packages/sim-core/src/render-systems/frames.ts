import type { GameEntity } from "../components";
import type { Season } from "../protocols/weather";
import { easeOutQuad } from "@engine/core";
import { loopClip, sampleCycle } from "./cycle";

const TILE = 16;

export const FOAM_FRAMES = ["tile/foam-a", "tile/foam-b", "tile/foam-c"] as const;

export const FISHING_SPOT_FRAMES = [
  "structure/fishing-spot",
  "structure/fishing-spot-b",
  "structure/fishing-spot-c",
] as const;

const FISHING_SPOT_CLIP = loopClip("fishing-spot", FISHING_SPOT_FRAMES, 1200);

const ACTION_SWING_HALF_MS = 220; 

const ACTION_POP_AMP = 0.1;

const IDLE_BOB_MS = 1700;
const IDLE_BOB_AMP = 1.3;
const IDLE_BOB_RISE = 0.35; 

export const FORGE_FIRE_FRAMES = [
  "structure/forge-fire-a",
  "structure/forge-fire-b",
  "structure/forge-fire-c",
] as const;

export const FORGE_OVEN_TILE = { x: 97, y: 79 } as const;

export const FORGE_SMOKE_FRAMES = [
  "structure/forge-smoke-a",
  "structure/forge-smoke-b",
  "structure/forge-smoke-c",
] as const;

export const FORGE_CHIMNEY_PX = {
  x: 99 * TILE + 11,
  y: 78 * TILE + TILE - 48 + 2,
} as const;

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

export const CAMPFIRE_FRAMES = [
  "structure/campfire-a",
  "structure/campfire-b",
  "structure/campfire-c",
] as const;

export const WEATHER_BEACON_FRAMES = [
  "structure/weather-beacon-a",
  "structure/weather-beacon-b",
] as const;

export const WEATHER_BEACON_PX = {
  x: 114 * TILE + TILE / 2,
  y: 119 * TILE + TILE / 2,
} as const;

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

export function isFarmerMoving(entity: GameEntity): boolean {
  const farmer = entity.farmer;
  return farmer?.path !== undefined || farmer?.movedThisTick === true;
}

const WALK_CYCLE_MS = 440; 
const WALK_PHASE_MS = WALK_CYCLE_MS / 4; 

const WALK_CLIP = loopClip("farmer-walk", ["/walk-a", "", "/walk-b", ""], WALK_CYCLE_MS, [
  { name: "step", atMs: 0 },
  { name: "step", atMs: WALK_PHASE_MS * 2 },
]);

export function walkStepsBetween(id: number, prevMs: number, nowMs: number): number {
  const off = id * WALK_PHASE_MS;
  return WALK_CLIP.eventsBetween(prevMs + off, nowMs + off).length;
}

export const ACTION_POSE: Record<string, string> = {
  till:          "/till",
  water:         "/water",
  "refill-can":  "/refill",
  "chop-tree":   "/chop",
  "mine-stone":  "/mine",
  plant:         "/plant",
  harvest:       "/work",   
};

export type Facing = "down" | "up" | "side";

const FACING_SEG: Record<Facing, string> = { down: "", up: "/up", side: "/side" };

export function enumerateFarmerFrames(base: string): string[] {
  const out = new Set<string>();
  for (const seg of Object.values(FACING_SEG)) {
    const dir = base + seg;
    out.add(dir); 
    for (const f of WALK_CLIP.frames) if (f.frame) out.add(dir + f.frame); 
  }
  for (const suffix of new Set(Object.values(ACTION_POSE))) {
    out.add(base + suffix); 
    out.add(base + suffix + "-b"); 
  }
  return [...out];
}

const SEASONAL_FOLIAGE_BASES: ReadonlySet<string> = new Set([
  "structure/tree",
  "structure/bush",
  "structure/fruit-tree",
  "structure/big-tree",
]);

const SEASON_FOLIAGE_SUFFIX: Record<Season, string> = {
  spring: "-blossom",
  summer: "", 
  autumn: "-autumn",
  winter: "-bare",
};

export function seasonalTreeFrame(frame: string, season: Season): string {
  if (!SEASONAL_FOLIAGE_BASES.has(frame)) return frame;
  return frame + SEASON_FOLIAGE_SUFFIX[season];
}

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

  const base = s.frame;

  if (s.action !== null && s.action in ACTION_POSE) {
    const pose = base + ACTION_POSE[s.action];

    const useB = (Math.floor(nowMs / ACTION_SWING_HALF_MS) + (s.id ?? 0)) % 2 === 1;

    const q = (nowMs % ACTION_SWING_HALF_MS) / ACTION_SWING_HALF_MS;
    const scale = useB ? 1 + ACTION_POP_AMP * (1 - easeOutQuad(q)) : 1;
    return { frame: useB ? `${pose}-b` : pose, bobY: 0, scale };
  }

  const facing: Facing = s.facing ?? "down";
  const dir = base + FACING_SEG[facing];

  if (s.moving === true) {

    return { frame: dir + sampleCycle(WALK_CLIP, nowMs, s.id ?? 0), bobY: 0 };
  }

  const p = (((nowMs / IDLE_BOB_MS) + (s.id ?? 0) * 0.21) % 1 + 1) % 1;
  const tri = p < IDLE_BOB_RISE ? p / IDLE_BOB_RISE : 1 - (p - IDLE_BOB_RISE) / (1 - IDLE_BOB_RISE);
  const bobY = -easeOutQuad(tri) * IDLE_BOB_AMP;
  return { frame: dir, bobY };
}
