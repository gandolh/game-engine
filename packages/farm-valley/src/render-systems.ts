import type { World } from "@engine/core";
import { Canvas2dRenderer } from "@engine/core";
import type { Canvas2dSprite } from "@engine/core";
import type { GameEntity } from "./components";
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  REGIONS,
  TOWN_SQUARE,
  regionAt,
  isWalkable,
} from "./world/regions";

const TILE = 16;

interface LogicalSprite {
  x: number;
  y: number;
  width: number;
  height: number;
  frame: string;
  rotation: number;
  layer: number;
  alpha: number;
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

/**
 * Decide which background frame (if any) a tile gets.
 * - void (non-walkable) → null
 * - road only (no region) → "tile/path"
 * - farm-* → "tile/grass"
 * - village inner square (TOWN_SQUARE) → "tile/market-floor" (decorative stone)
 * - village outer → "tile/dirt"
 * - blacksmith → "tile/forge-floor" (dark stone with heat cracks)
 * - carpentry → "tile/wood-plank"
 * - resource-zone → "tile/grass" (same as farms — they're green areas)
 */
function backdropFrame(tx: number, ty: number): string | null {
  // Non-walkable tiles (out-of-region gaps, world border) render as ocean, so
  // the playable regions read as islands in an ocean rather than floating in a
  // black void. Walkability is unaffected (this is purely visual).
  if (!isWalkable(tx, ty)) return "tile/ocean";
  const region = regionAt(tx, ty);
  if (region === null) {
    // Road-only tile. If it spans water it gets a plank bridge (drawn as a
    // separate overlay in iterStaticSprites); otherwise a plain dirt path.
    return BRIDGE_SET.has(ty * WORLD_WIDTH + tx) ? "tile/ocean" : "tile/path";
  }
  if (region.startsWith("farm-")) return "tile/grass";
  if (region === "blacksmith") return "tile/forge-floor";
  if (region === "carpentry") return "tile/wood-plank";
  if (region === "forest-north" || region === "forest-south") return "tile/grass";
  if (region === "quarry-north" || region === "quarry-south") return "tile/quarry-floor";
  if (region === "mill") return "tile/stone-floor";
  if (region === "well-north" || region === "well-south") return "tile/stone-floor";
  if (region === "mushroom-grove") return "tile/mushroom-floor";
  if (region === "ice-pond") return "tile/ice-floor";
  if (region === "village") {
    // Market square gets the decorative floor; outer village stays cobblestone
    if (tx >= TOWN_SQUARE.minX && tx <= TOWN_SQUARE.maxX &&
        ty >= TOWN_SQUARE.minY && ty <= TOWN_SQUARE.maxY) {
      return "tile/market-floor";
    }
    return "tile/dirt";
  }
  return "tile/dirt"; // fallback for any future region
}

interface FenceTile {
  tx: number;
  ty: number;
  rotation: number;
}

/**
 * Compute fence perimeter tiles for every farm region. Skips any tile whose
 * neighbor (one step outside the farm) is walkable — that's the road-facing
 * gap where the farm meets a road, so we don't visually block the entry.
 *
 * Top/bottom edges → fence-h rotation 0
 * Left/right edges → fence-h rotation 90° (Math.PI / 2)
 */
function computeFences(): readonly FenceTile[] {
  const out: FenceTile[] = [];
  for (const region of REGIONS) {
    if (region.kind !== "farm") continue;
    const { minX, minY, maxX, maxY } = region.bounds;

    // Top edge (ty = minY). Neighbor outside is (tx, minY - 1).
    for (let tx = minX; tx <= maxX; tx++) {
      if (isWalkable(tx, minY - 1)) continue; // road entry — leave open
      out.push({ tx, ty: minY, rotation: 0 });
    }
    // Bottom edge (ty = maxY). Neighbor outside is (tx, maxY + 1).
    for (let tx = minX; tx <= maxX; tx++) {
      if (isWalkable(tx, maxY + 1)) continue;
      out.push({ tx, ty: maxY, rotation: 0 });
    }
    // Left edge (tx = minX). Neighbor outside is (minX - 1, ty). Skip the
    // corners (already drawn by top/bottom passes).
    for (let ty = minY + 1; ty <= maxY - 1; ty++) {
      if (isWalkable(minX - 1, ty)) continue;
      out.push({ tx: minX, ty, rotation: Math.PI / 2 });
    }
    // Right edge (tx = maxX).
    for (let ty = minY + 1; ty <= maxY - 1; ty++) {
      if (isWalkable(maxX + 1, ty)) continue;
      out.push({ tx: maxX, ty, rotation: Math.PI / 2 });
    }
  }
  return out;
}

const FENCES: readonly FenceTile[] = computeFences();

interface ShoreTile {
  tx: number;
  ty: number;
  rotation: number;
}

/**
 * Compute shoreline overlay tiles: every LAND tile (walkable) that borders the
 * OCEAN (a non-walkable tile, which renders as ocean) gets a foam/sand band on
 * the edge facing the water. The band sprite (`tile/shore`) is authored along
 * the tile's top edge and rotated to face the adjacent ocean. A land tile with
 * ocean on multiple sides emits one band per ocean side.
 *
 * Rotation by neighbor direction (band faces "up" at rotation 0):
 *   above (−Y) → 0, right (+X) → 90°, below (+Y) → 180°, left (−X) → 270°.
 */
function computeShores(): readonly ShoreTile[] {
  const out: ShoreTile[] = [];
  const dirs: Array<[number, number, number]> = [
    [0, -1, 0],
    [1, 0, Math.PI / 2],
    [0, 1, Math.PI],
    [-1, 0, (3 * Math.PI) / 2],
  ];
  for (let ty = 0; ty < WORLD_HEIGHT; ty++) {
    for (let tx = 0; tx < WORLD_WIDTH; tx++) {
      if (!isWalkable(tx, ty)) continue; // only land tiles get a shore
      for (const [dx, dy, rotation] of dirs) {
        const nx = tx + dx;
        const ny = ty + dy;
        // Off-grid OR non-walkable neighbor ⇒ that side faces ocean.
        const neighborIsOcean =
          nx < 0 || ny < 0 || nx >= WORLD_WIDTH || ny >= WORLD_HEIGHT || !isWalkable(nx, ny);
        if (neighborIsOcean) out.push({ tx, ty, rotation });
      }
    }
  }
  return out;
}

const SHORES: readonly ShoreTile[] = computeShores();

interface BridgeTile {
  tx: number;
  ty: number;
  rotation: number;
}

/**
 * Compute bridge tiles: every ROAD-only walkable tile (region === null) that
 * borders the ocean. These are the corridors that connect the islands across
 * water — without a deck they read as a dirt path floating on the sea, so we
 * draw a plank bridge instead of `tile/path`.
 *
 * Orientation: the bridge deck is authored HORIZONTAL (rails on the top/bottom
 * long edges, you walk left↔right). We rotate it 90° when the corridor runs
 * vertically — detected by comparing how the tile connects to its neighbours:
 * if the road continues up/down (walkable) but is open to ocean left/right, the
 * span is vertical. Ties default to horizontal.
 */
function isBridge(tx: number, ty: number): boolean {
  if (!isWalkable(tx, ty)) return false;
  if (regionAt(tx, ty) !== null) return false; // region interiors are land
  // Touches ocean on at least one side ⇒ it's spanning water.
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
    const nx = tx + dx;
    const ny = ty + dy;
    const off = nx < 0 || ny < 0 || nx >= WORLD_WIDTH || ny >= WORLD_HEIGHT;
    if (off || !isWalkable(nx, ny)) return true;
  }
  return false;
}

function computeBridges(): readonly BridgeTile[] {
  const key = (x: number, y: number) => y * WORLD_WIDTH + x;
  // Pass 1: every road tile that directly touches ocean.
  const deck = new Set<number>();
  for (let ty = 0; ty < WORLD_HEIGHT; ty++) {
    for (let tx = 0; tx < WORLD_WIDTH; tx++) {
      if (isBridge(tx, ty)) deck.add(key(tx, ty));
    }
  }
  const oceanOrDeck = (x: number, y: number): boolean => {
    const off = x < 0 || y < 0 || x >= WORLD_WIDTH || y >= WORLD_HEIGHT;
    if (off || !isWalkable(x, y)) return true; // ocean
    return deck.has(key(x, y));
  };
  // Pass 2 (fixpoint): a road tile flanked on BOTH sides of an axis by
  // ocean-or-deck is itself part of the span (fills the interior of a wide
  // crossing the edge-only pass-1 misses). Repeat until stable.
  let changed = true;
  while (changed) {
    changed = false;
    for (let ty = 0; ty < WORLD_HEIGHT; ty++) {
      for (let tx = 0; tx < WORLD_WIDTH; tx++) {
        if (deck.has(key(tx, ty))) continue;
        if (!isWalkable(tx, ty) || regionAt(tx, ty) !== null) continue; // road-only
        const hSpan = oceanOrDeck(tx - 1, ty) && oceanOrDeck(tx + 1, ty);
        const vSpan = oceanOrDeck(tx, ty - 1) && oceanOrDeck(tx, ty + 1);
        if (hSpan || vSpan) {
          deck.add(key(tx, ty));
          changed = true;
        }
      }
    }
  }
  // Emit with a per-tile rotation from the span direction.
  const out: BridgeTile[] = [];
  for (const k of deck) {
    const tx = k % WORLD_WIDTH;
    const ty = Math.floor(k / WORLD_WIDTH);
    const vertical = isWalkable(tx, ty - 1) || isWalkable(tx, ty + 1);
    const horizontal = isWalkable(tx - 1, ty) || isWalkable(tx + 1, ty);
    const rotation = vertical && !horizontal ? Math.PI / 2 : 0;
    out.push({ tx, ty, rotation });
  }
  return out;
}

const BRIDGES: readonly BridgeTile[] = computeBridges();
/** Fast lookup so backdropFrame can suppress `tile/path` on bridge tiles. */
const BRIDGE_SET: ReadonlySet<number> = new Set(
  BRIDGES.map((b) => b.ty * WORLD_WIDTH + b.tx),
);

/**
 * In-world ocean tiles (non-walkable tiles inside the 40×40 grid). Used by the
 * main-thread render loop to draw the animated foam overlay. Out-of-grid water
 * (beyond the world edge) is covered by the renderer's ocean clearColor, so we
 * only animate the in-grid gaps between/around the islands.
 */
export const OCEAN_TILES: ReadonlyArray<{ tx: number; ty: number }> = (() => {
  const out: Array<{ tx: number; ty: number }> = [];
  for (let ty = 0; ty < WORLD_HEIGHT; ty++) {
    for (let tx = 0; tx < WORLD_WIDTH; tx++) {
      if (!isWalkable(tx, ty)) out.push({ tx, ty });
    }
  }
  return out;
})();

/** The three animated foam frames, cycled for the water shimmer. */
export const FOAM_FRAMES = ["tile/foam-a", "tile/foam-b", "tile/foam-c"] as const;

/** Animated forge-fire frames, cycled in the blacksmith oven's mouth. */
export const FORGE_FIRE_FRAMES = [
  "structure/forge-fire-a",
  "structure/forge-fire-b",
  "structure/forge-fire-c",
] as const;

/** Tile of the blacksmith oven (matches region-setup placeProps). The fire
 *  overlay is drawn here, above the oven body. */
export const FORGE_OVEN_TILE = { x: 61, y: 37 } as const;

/**
 * The static backdrop: tiles + farm fences + plot dirt. These never change
 * after world setup, so they're baked once into the renderer's static layer
 * (see `Canvas2dRenderer.bakeStaticLayer`) instead of re-emitted every frame.
 * Crops on top of plots stay dynamic (they grow), so they're NOT here.
 */
export function* iterStaticSprites(world: World<GameEntity>): Generator<LogicalSprite> {
  // Backdrop: one pass over the 40×40 grid. Void tiles emit nothing.
  for (let ty = 0; ty < WORLD_HEIGHT; ty++) {
    for (let tx = 0; tx < WORLD_WIDTH; tx++) {
      const frame = backdropFrame(tx, ty);
      if (frame === null) continue;
      yield {
        x: tx * TILE + TILE / 2,
        y: ty * TILE + TILE / 2,
        width: TILE,
        height: TILE,
        frame,
        rotation: 0,
        layer: 0,
        alpha: 1,
      };
    }
  }

  // Shoreline foam/sand bands: on each land tile bordering ocean, facing the
  // water. Layer 1 — above the base backdrop (0), below plot dirt (2)/fences.
  for (const shore of SHORES) {
    yield {
      x: shore.tx * TILE + TILE / 2,
      y: shore.ty * TILE + TILE / 2,
      width: TILE,
      height: TILE,
      frame: "tile/shore",
      rotation: shore.rotation,
      layer: 1,
      alpha: 1,
    };
  }

  // Plank bridges over the water gaps between islands (drawn above the ocean
  // backdrop + shore foam, below fences). Rotated per computeBridges.
  for (const bridge of BRIDGES) {
    yield {
      x: bridge.tx * TILE + TILE / 2,
      y: bridge.ty * TILE + TILE / 2,
      width: TILE,
      height: TILE,
      frame: "tile/bridge-h",
      rotation: bridge.rotation,
      layer: 3,
      alpha: 1,
    };
  }

  // Farm perimeter fences (village gets none).
  for (const fence of FENCES) {
    yield {
      x: fence.tx * TILE + TILE / 2,
      y: fence.ty * TILE + TILE / 2,
      width: TILE,
      height: TILE,
      frame: "tile/fence-h",
      rotation: fence.rotation,
      layer: 20,
      alpha: 1,
    };
  }

  // Plot dirt tiles (static). The crop sprite layered on top is dynamic.
  for (const plot of world.query("plot")) {
    yield {
      x: plot.plot.tileX * TILE + TILE / 2,
      y: plot.plot.tileY * TILE + TILE / 2,
      width: TILE,
      height: TILE,
      frame: "tile/dirt",
      rotation: 0,
      layer: 2,
      alpha: 1,
    };
  }
}

/** Materialize the static backdrop sprites for a one-time bake. */
export function buildStaticLayerSprites(world: World<GameEntity>): Canvas2dSprite[] {
  const out: Canvas2dSprite[] = [];
  for (const ls of iterStaticSprites(world)) {
    out.push({
      x: ls.x,
      y: ls.y,
      width: ls.width,
      height: ls.height,
      frame: ls.frame,
      rotation: ls.rotation,
      layer: ls.layer,
      alpha: ls.alpha,
    });
  }
  return out;
}

// Maps each farmer action kind to the atlas pose suffix to use while performing it.
// Actions not in this map fall back to the normal walk/idle animation.
const ACTION_POSE: Record<string, string> = {
  till:          "/till",
  water:         "/water",
  "refill-can":  "/refill",
  "chop-tree":   "/chop",
  "mine-stone":  "/mine",
  plant:         "/plant",
  harvest:       "/work",   // harvest has no dedicated pose — use generic work
};

/**
 * Pick the final atlas frame for a snapshot sprite, applying:
 *  - a distinct action pose when the farmer is performing a physical action
 *  - idle bob offset (returned separately as `bobY`) when standing still
 *
 * The base frame carried on the sprite is stripped of any trailing walk suffix
 * before the action pose suffix is appended, so mid-walk action events resolve
 * cleanly to the correct personality frame (e.g. `farmer/hoarder/till`).
 */
function resolveFrameAndBob(
  s: import("./worker/snapshot").SnapshotSprite,
  nowMs: number,
): { frame: string; bobY: number } {
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

/**
 * Push snapshot sprites (dynamic layer from the sim worker) into the renderer.
 * Each SnapshotSprite is already in pixel space and has alpha pre-computed.
 * Width/height default to TILE (16) for all snapshot sprites.
 *
 * This also draws:
 *  - MEET bubble (indicator/meet) sprites above each active meet farmer,
 *    positioned at the interpolated farmer pixel position from the snapshot.
 *  - Focus halo segments around the focused farmer (identified by id) using
 *    the interpolated position supplied by the caller.
 */
export function pushSnapshotSprites(
  renderer: Canvas2dRenderer,
  sprites: import("./worker/snapshot").SnapshotSprite[],
  meets: import("./worker/snapshot").SnapshotMeet[],
  farmerPositions: Map<number, { x: number; y: number }>,
  focusedFarmerId: number | null,
  nowMs: number = 0,
): void {
  // Sprites + ground drop-shadows for characters (sprites with an entity id).
  for (const s of sprites) {
    const { frame, bobY } = resolveFrameAndBob(s, nowMs);
    // Shadow: small ellipse at feet (bottom edge of sprite), drawn under all sprites.
    if (s.id !== null) {
      renderer.pushShadow(s.x, s.y + TILE * 0.35, TILE * 0.32, TILE * 0.12, 0.45);
    }
    renderer.push({
      x: s.x,
      y: s.y + bobY,
      width: TILE,
      height: TILE,
      frame,
      rotation: s.rotation,
      layer: s.layer,
      alpha: s.alpha,
      flipX: s.flipX ?? false,
    });
  }

  // Meet bubbles (one tile above farmer)
  for (const meet of meets) {
    const pos = farmerPositions.get(meet.farmerId);
    if (!pos) continue;
    renderer.push({
      x: pos.x,
      y: pos.y - TILE,
      width: TILE,
      height: TILE,
      frame: "indicator/meet",
      rotation: 0,
      layer: 90,
      alpha: 1,
    });
  }

  // Focus halo (4 small segments at N/E/S/W around the focused farmer)
  if (focusedFarmerId !== null) {
    const pos = farmerPositions.get(focusedFarmerId);
    if (pos) {
      const r = TILE * 0.8;
      const offsets: Array<[number, number, number]> = [
        [0, -r, 0],
        [r, 0, Math.PI / 2],
        [0, r, 0],
        [-r, 0, Math.PI / 2],
      ];
      for (const [dx, dy, rot] of offsets) {
        renderer.push({
          x: pos.x + dx,
          y: pos.y + dy,
          width: TILE * 0.5,
          height: TILE * 0.5,
          frame: "tile/fence-h",
          rotation: rot,
          layer: 50,
          alpha: 0.85,
        });
      }
    }
  }
}
