/**
 * Citadel WebGPU renderer module.
 *
 * Owns the engine-renderer setup (WebGPU backend, forced) and the per-frame
 * scene draw. The Canvas2D draw path (terrain-renderer / building-renderer) is
 * gone from the citadel client — terrain is baked once via the engine's
 * static-layer pass, and buildings / villagers / raiders are solid colored
 * `sprite-batch` quads drawn from a generated 1×1 white atlas. The placement
 * ghost + drag-paint preview are also sprite-batch quads (translucent, top
 * layer) — NOT the `endFrame` overlay callback, which the WebGPU backend
 * ignores (see `ghostQuad` / `pushGhost`).
 *
 * Pure helpers (color/footprint mapping, terrain decorate, the Camera2D
 * screen→tile transform) are EXPORTED and unit-tested headlessly — they never
 * touch the GPU, so jsdom (no WebGPU) can exercise them.
 *
 * All colors route through `EDG.*`; quad tints are packed `0xRRGGBBAA` ints
 * built from `rgbOf(EDG.*)`, so the palette guard stays clean.
 *
 * BRIEF 24 DEFERRAL (wear/decay): the full procedural-noise WGSL wear shader and
 * time-based aging are DEFERRED — they require an engine tint-pass/WGSL
 * extension AND a sim-side `age`/`wear` field (which would touch @citadel/
 * sim-core + determinism). This module ships only the render-only slice: a
 * fire-damage soot/scorch overlay (`wearFactor`/`wearOverlayQuads`/
 * `pushWearOverlay`) driven by the snapshot's existing `burning`/`onFire`.
 */
import {
  EDG,
  Camera2D,
  createRenderer,
} from "@engine/core";
import type { RendererLike, LoadedAtlasImage, Canvas2dSprite, CloudOptions } from "@engine/core";
import { TILE_SIZE, isTravellingFsm } from "@citadel/sim-core";
import type {
  BuildingSnapshot,
  VillagerSnapshot,
  RaiderSnapshot,
} from "@citadel/sim-core";

// Sub-modules: pure helper families extracted for clarity.
import {
  QUAD_ATLAS_ID,
  QUAD_FRAME,
  quadToSprite,
  packTint,
  buildingQuad,
  buildingShadowQuad,
  SHADOW_OFFSET,
  SHADOW_ALPHA,
  villagerQuad,
  raiderQuad,
  ghostQuad,
} from "./quads";
import { ISO_TILE_W, ISO_TILE_H, makeIso } from "./iso";
import type { IsoProjection } from "./iso";
import { isoNetworkTiles } from "./autotile";
import { FRAME_DIAMOND, FRAME_ROAD, FRAME_BRIDGE, flameFrameAt } from "./sprites/recipes";
import { clusterBuildings, clusterBorderQuads } from "./clustering";
import { makeTerrainDecorate } from "./terrain-dither";
import { RenderWindowController } from "./window-controller";
import { createCitadelSpriteAtlas } from "./sprites/atlas";
import { disconnectedBuildings } from "./road-feedback";
// Phase A cozy pivot: pure mood→cue mappings (warm glow strength + sprite dim).
// fx imports a couple of helpers back from this module (villagerQuad/QuadSpec);
// the resulting ES-module cycle is safe — every binding is used at call time,
// never at module-eval time.
import { glowAlphaForMood, houseAlphaForMood, villagerAlphaForMood, villagerSlumpOffset, fireGlowQuads, fireFlicker } from "./citadel-fx";

// ---------------------------------------------------------------------------
// Re-export the full prior public surface so existing imports keep resolving.
// citadel-renderer.test.ts and main.ts import everything from this file.
// ---------------------------------------------------------------------------
export * from "./iso";
export * from "./quads";
export * from "./wear";
export * from "./autotile";
export * from "./clustering";
export * from "./transform";
export * from "./terrain-dither";
export * from "./window-controller";

import type { TerrainGrid } from "@citadel/sim-core";

import { seasonToWeather } from "./weather";

// ---------------------------------------------------------------------------
// Atmosphere: fBm cloud-shadow + warm-haze overlay wiring (art-03 P2)
// ---------------------------------------------------------------------------

/**
 * Cool EDG tint for the drifting cloud-SHADOW blobs — a soft slate shade, not a
 * hard blue-black, so the shadows read as passing overcast rather than ink.
 */
const CLOUD_SHADOW_COLOR = EDG.slate;

/**
 * Warm EDG tint for the morning-HAZE veil — a low-alpha cream lift for cozy
 * mist. The shader's haze branch keeps max alpha ≤0.12 so it stays a whisper.
 */
const HAZE_COLOR = EDG.cream;

/** Slow world-px/s drift so the shadows crawl gently across the terrain. */
const CLOUD_DRIFT_SPEED = 3.5;

/**
 * Derive the engine `CloudOptions` (the world-anchored fBm overlay) for one
 * frame, as a PURE function of the snapshot's `season`/`day` + the render clock.
 * Render-only — the pass world-anchors the fBm, so `timeSec` (render clock) only
 * animates drift and never feeds the sim.
 *
 *  - Coverage tracks the same season→weather cadence the weather FX uses: a
 *    rainy/overcast day (or winter) raises coverage so the sky reads heavier;
 *    clear days keep only a few sparse shadow patches.
 *  - Morning (early `dayFraction`) swaps the dark shadow blobs for a warm, very
 *    low-alpha haze veil (mode "haze") for a cozy dawn mist; the rest of the day
 *    uses the cool cloud-shadow mode.
 *
 * `dayFraction` in [0,1) is the same value `atmosphere.computeWash` consumes.
 */
export function cloudOptionsFor(
  season: string,
  day: number,
  dayFraction: number,
  timeSec: number,
): CloudOptions {
  const w = seasonToWeather(season, day);
  // Base overcast: overcast/rainy spells + winter push coverage up.
  let coverage: number;
  if (w.kind === "snow") coverage = 0.75;
  else if (w.kind === "rain") coverage = 0.85;
  else coverage = 0.28; // clear-ish day: a few sparse drifting shadows

  // Morning haze window: dawn → ~mid-morning (dayFraction 0..0.22), strongest at
  // first light and fading out by mid-morning. Uses the warm low-alpha veil.
  const df = ((dayFraction % 1) + 1) % 1;
  const hazeAmt = df < 0.22 ? 1 - df / 0.22 : 0;
  if (hazeAmt > 0.02) {
    return {
      color: HAZE_COLOR,
      // Haze coverage fades with the morning so the mist thins out as the sun climbs.
      coverage: Math.max(coverage * 0.5, 0.6 * hazeAmt),
      driftSpeed: CLOUD_DRIFT_SPEED * 0.5, // haze drifts even slower
      timeSec,
      mode: "haze",
    };
  }

  return {
    color: CLOUD_SHADOW_COLOR,
    coverage,
    driftSpeed: CLOUD_DRIFT_SPEED,
    timeSec,
    mode: "shadow",
  };
}

// Sprite layers — higher draws on top. Terrain is the baked static layer
// (below everything); these stack buildings < villagers < raiders < ghost.
const LAYER_SHADOW = 8;
// Isometric: buildings, villagers, and raiders share ONE entity layer so they
// inter-sort back-to-front by their iso depth (set as each sprite's `sortY`),
// which is what makes a villager in front correctly occlude a building behind.
const LAYER_ENTITY = 10;
const LAYER_GHOST = 40;
/** Atmosphere layers (brief 15/18). The light pool sits on the GROUND (just
 *  above the drop-shadow, BELOW buildings) so the warm glow pools around each
 *  emitter's base like lamplight on the ground, instead of washing a hard tint
 *  over the building sprite. The ambient crowd walks below the real villagers
 *  but above buildings. */
const LAYER_LIGHT_POOL = 9;
const LAYER_AMBIENT_CROWD = 15;
// Service catchment tints (placement ring + coverage overlay, 2026-06-22). Sits
// just below the ghost (40) and above everything else, so the coverage wash
// reads ON TOP of buildings like an OpenTTD catchment highlight rather than
// hiding under them.
const LAYER_COVERAGE = 38;
// Disconnected-building "no road" marker — floats above its building, just under
// the ghost/coverage so it reads as a HUD pip over the world (road-builder
// feedback, 2026-06-27).
const LAYER_DISCONNECT = 39;

// Re-import LAYER_NETWORK for use in pushNetworks.
import { LAYER_NETWORK } from "./autotile";

import type { QuadSpec } from "./quads";

// ---------------------------------------------------------------------------
// Generated 1×1 white atlas (sprite-batch needs a texture)
// ---------------------------------------------------------------------------

/**
 * Build a 1×1 white-pixel atlas in-process. The sprite-batch samples this and
 * multiplies by `tintRgba`, so a white texel + a packed EDG tint yields a solid
 * EDG-colored quad. `width/height` on each pushed sprite scale the 1×1 quad to
 * the desired footprint. Async because `createImageBitmap` is async.
 */
export async function createQuadAtlas(): Promise<LoadedAtlasImage> {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("createQuadAtlas: failed to acquire 2d context");
  // EDG.white — the tint does the actual coloring.
  ctx.fillStyle = EDG.white;
  ctx.fillRect(0, 0, 1, 1);
  const bitmap = await createImageBitmap(canvas);

  const rect = { x: 0, y: 0, w: 1, h: 1 } as const;
  return {
    manifest: {
      id: QUAD_ATLAS_ID,
      imageUrl: "",
      width: 1,
      height: 1,
      frames: { [QUAD_FRAME]: { x: 0, y: 0, w: 1, h: 1 } },
    },
    bitmap,
    frameRect(frame: string) {
      if (frame !== QUAD_FRAME) throw new Error(`citadel quad atlas: unknown frame ${frame}`);
      return rect;
    },
  };
}

// ---------------------------------------------------------------------------
// Renderer setup
// ---------------------------------------------------------------------------

export interface CitadelRenderer {
  renderer: RendererLike;
  camera: Camera2D;
  /** The iso projection for THIS world's size — pass it to every `push*` and to
   *  `screenToTile`/`fitCameraToCanvas`. There is no module-level projection. */
  iso: IsoProjection;
  /** Drives the windowed static-layer bake (Citadel 21/22). Call `update(camera)`
   *  each frame after fitting the camera; a no-op on small (solo) worlds. */
  windowController: RenderWindowController;
}

/**
 * Create the WebGPU-backed citadel renderer: force the WebGPU backend (the FV
 * pattern), register the generated quad atlas, set the clear color, and bake
 * the terrain backdrop. On the large MP world the bake is render-windowed (only
 * the camera window is textured, re-baked on pan via the controller); on the
 * small solo world it bakes whole-world once (identical to before). Throws if
 * WebGPU is unavailable (no silent Canvas2D fallback — Citadel is WebGPU-only).
 */
export async function createCitadelRenderer(
  canvas: HTMLCanvasElement,
  terrain: TerrainGrid,
): Promise<CitadelRenderer> {
  // Brief 110: the projection is derived from the terrain we were actually handed,
  // not from a compile-time constant. In MP that terrain came from the server.
  const iso = makeIso(terrain.width, terrain.height);
  const camera = new Camera2D({
    worldUnitsX: iso.worldPxW,
    worldUnitsY: iso.worldPxH,
    centerX: iso.worldPxW / 2,
    centerY: iso.worldPxH / 2,
  });

  const renderer = await createRenderer(canvas, camera, {
    backend: "webgpu",
    onBackend: (b) => console.info("[citadel render] backend:", b),
  });

  renderer.clearColor = EDG.black;
  // Pixel art — keep crisp quad edges.
  renderer.pixelSnap = true;

  // Real pixel-art sprite atlas (buildings/villagers/raiders), generated
  // in-process at boot. Retains the 1×1 white `px` frame the tinted-quad paths
  // (ghost, light-pool, wear, autotile, cluster border, crowd) still use.
  const atlas = await createCitadelSpriteAtlas();
  renderer.addAtlas(atlas);

  // Bake the terrain static layer. The controller decides whole-world (small
  // map) vs render-windowed (large MP map); the initial bake uses the camera's
  // boot framing (fully zoomed out → whole world either way).
  const windowController = new RenderWindowController(renderer, iso, terrain);
  windowController.bakeInitial(camera);

  return { renderer, camera, iso, windowController };
}

// ---------------------------------------------------------------------------
// Per-frame scene draw
// ---------------------------------------------------------------------------

export interface SceneInput {
  buildings: readonly BuildingSnapshot[];
  villagers: readonly VillagerSnapshot[];
  raiders: readonly RaiderSnapshot[];
}

/**
 * Optional render-side FX hooks (briefs 17/18) the caller threads into
 * `pushScene` without `citadel-renderer` depending on the FX module. Both are
 * pure-callback shaped: given a building / villager, return how to bend its
 * quad. Omitting `fx` (or returning null/identity) draws the plain scene.
 *
 *  - `building(b, quad)` → adjusted quad + alpha for the placement ease-in. The
 *    callback already has the base `buildingQuad(b)` result so it can scale
 *    about the footprint centre.
 *  - `villagerYOffset(v)` → vertical bob offset in world px (idle bob).
 *  - `villagerPos(v)` / `raiderPos(r)` → render-only interpolated TILE position
 *    (x,y) for a moving unit, so it glides between snapshots instead of snapping
 *    tile-to-tile. Omit (or return the snapshot's own x/y) to draw un-interpolated.
 */
export interface SceneFx {
  building?: (b: BuildingSnapshot, quad: QuadSpec) => { quad: QuadSpec; alpha: number };
  villagerYOffset?: (v: VillagerSnapshot) => number;
  villagerPos?: (v: VillagerSnapshot) => { x: number; y: number };
  raiderPos?: (r: RaiderSnapshot) => { x: number; y: number };
}

/**
 * Per-type sprite art height in tiles (how far the building "rises" above its
 * ground diamond in the iso view). Taller structures loom; flat features stay
 * ground-height. Falls back to 1. Render-only.
 */
// MUST match the `heightTiles` authored per type in sprites/recipes/buildings.ts
// so the sprite art maps 1:1 onto the quad (shared isoSpriteDims).
const BUILDING_HEIGHT_TILES: Record<string, number> = {
  keep: 3, tower: 3, garrison: 2, chapel: 2, mill: 3,
  "town-hall": 2, healer: 2, mine: 2,
  wall: 1, gate: 1, road: 0,
};
function buildingHeightTiles(type: string): number {
  return BUILDING_HEIGHT_TILES[type] ?? 1;
}

/**
 * Project a building's logical quad into an iso-placed sprite quad. The frame +
 * tint come from `buildingQuad`; position/size come from `isoFootprintBox`
 * (anchored at the footprint diamond, risen by the per-type art height). Returns
 * the iso quad + its painter's-order depth.
 */
function isoBuildingPlacement(iso: IsoProjection, b: BuildingSnapshot, base: QuadSpec): { quad: QuadSpec; depth: number } {
  const box = iso.isoFootprintBox(b.x, b.y, b.w, b.h, buildingHeightTiles(b.type));
  return {
    quad: { x: box.x, y: box.y, width: box.width, height: box.height, tintRgba: base.tintRgba, ...(base.frame !== undefined ? { frame: base.frame } : {}) },
    depth: box.depth,
  };
}

/**
 * Build a flat iso ground sprite stamping the `fx/diamond` frame (a real 2:1
 * diamond) at an iso-world-px box, tinted. Used for road/wall tiles, footprint
 * shadows, cluster borders, and the placement ghost — everything that should sit
 * FLAT on the iso grid rather than billboard upright.
 */
function isoDiamondSprite(x: number, y: number, width: number, height: number, tintRgba: number, layer: number, sortY: number): Canvas2dSprite {
  return isoFlatSprite(x, y, width, height, FRAME_DIAMOND, tintRgba, layer, sortY);
}

/** Like `isoDiamondSprite` but stamps an arbitrary flat frame (cobble road /
 *  plank bridge / plain diamond) — same iso-flat ground-plane placement.
 *
 *  `x,y` arrive as the TOP-LEFT of the iso box (every iso helper returns
 *  top-left); the engine sprite-batch anchors by CENTRE, so we add half-extents
 *  here — mirroring `quadToSprite`. Skipping this shifts the diamond up-left by
 *  half its size (the ghost/shadow then sit off the cursor / building base). */
function isoFlatSprite(x: number, y: number, width: number, height: number, frame: string, tintRgba: number, layer: number, sortY: number): Canvas2dSprite {
  return { atlasId: QUAD_ATLAS_ID, frame, x: x + width / 2, y: y + height / 2, width, height, rotation: 0, layer, alpha: 1, tintRgba, sortY };
}

/** Push one building's sprite quad, applying the optional placement ease-in fx. */
function pushBuilding(renderer: RendererLike, iso: IsoProjection, b: BuildingSnapshot, fx?: SceneFx, clockMs?: number, nightFactor = 0): void {
  const base = buildingQuad(b, clockMs, nightFactor);
  const { quad: isoBase, depth } = isoBuildingPlacement(iso, b, base);

  // Directional ground shadow: a flat iso diamond-ish box under the footprint.
  // Flat features (road/wall/gate) cast none.
  if (buildingShadowQuad(b) !== null) {
    const d = iso.isoFootprintDiamondBox(b.x, b.y, b.w, b.h, 0);
    renderer.push(isoDiamondSprite(d.x + SHADOW_OFFSET, d.y + SHADOW_OFFSET, d.width, d.height, packTint(EDG.ink, SHADOW_ALPHA), LAYER_ENTITY, depth - 0.0001));
  }

  // Phase A cozy pivot: a neglected house (low mood) reads dimmer/cooler than a
  // content one. We modulate the sprite alpha by mood (houses only); non-houses
  // keep full opacity. Composes with the placement ease-in alpha below.
  const moodAlpha = b.type === "house" ? houseAlphaForMood(b.mood) : 1;

  if (fx?.building !== undefined) {
    // The fx ease-in scales/fades about the footprint centre — apply it to the
    // iso-placed quad so the animation still reads.
    const { quad, alpha } = fx.building(b, isoBase);
    renderer.push(quadToSprite(quad, LAYER_ENTITY, alpha * moodAlpha, depth));
  } else {
    renderer.push(quadToSprite(isoBase, LAYER_ENTITY, moodAlpha, depth));
  }
}

/**
 * Frame-to-frame screen-space heading tracker for villagers. RENDER-ONLY: keyed
 * by villager id, it remembers the last projected screen position and derives a
 * smoothed heading from the delta — so a moving figure can lean + squash along
 * its travel direction. Never reads/writes the sim. Entries for vanished ids are
 * pruned lazily (a villager that stops being sampled simply ages out of `seen`).
 */
class VillagerHeadingTracker {
  private readonly last = new Map<number, { x: number; y: number; sx: number; sy: number; lean: number }>();
  private seen = new Set<number>();

  /** Sample id at screen (sx,sy); returns scale-x, scale-y, lean (radians). */
  sample(id: number, sx: number, sy: number): { sx: number; sy: number; lean: number } {
    const prev = this.last.get(id);
    this.seen.add(id);
    let scaleX = 1;
    let scaleY = 1;
    let lean = 0;
    if (prev !== undefined) {
      const dx = sx - prev.x;
      const dy = sy - prev.y;
      const speed = Math.hypot(dx, dy);
      if (speed > 0.15) {
        // Lean into the horizontal heading (max ~0.18 rad), squash/stretch a touch:
        // wider when moving sideways, taller when moving up/down screen.
        const ux = dx / speed;
        const uy = dy / speed;
        lean = ux * 0.18;
        scaleX = 1 + Math.abs(ux) * 0.12;
        scaleY = 1 + Math.abs(uy) * 0.12;
      }
      // Smooth so interpolation jitter doesn't make the figure twitch.
      scaleX = prev.sx + (scaleX - prev.sx) * 0.3;
      scaleY = prev.sy + (scaleY - prev.sy) * 0.3;
      lean = prev.lean + (lean - prev.lean) * 0.3;
    }
    this.last.set(id, { x: sx, y: sy, sx: scaleX, sy: scaleY, lean });
    return { sx: scaleX, sy: scaleY, lean };
  }

  /** Drop tracking for ids not sampled since the last sweep (call once/frame). */
  sweep(): void {
    for (const id of this.last.keys()) if (!this.seen.has(id)) this.last.delete(id);
    this.seen.clear();
  }
}

/** Per-client render-only heading tracker (the renderer is a single instance). */
const villagerHeading = new VillagerHeadingTracker();

/**
 * Push one frame's worth of building / villager / raider quads. Does NOT call
 * begin/endFrame — the caller owns the frame lifecycle so it can attach the
 * overlay. Pure-ish: only calls `renderer.push`. The optional `fx` hooks apply
 * the placement ease-in (building scale/alpha) and idle bob (villager Y).
 */
export function pushScene(renderer: RendererLike, iso: IsoProjection, scene: SceneInput, fx?: SceneFx, clockMs?: number, nightFactor = 0): void {
  // Roads + walls draw as autotiled connected networks (brief 11), not per-tile
  // through buildingQuad. Gates still draw their distinct gold block here.
  pushNetworks(renderer, iso, scene.buildings);

  // Houses route through the BFS clustering path (brief 12): each house now
  // draws as its own pixel-art sprite (via buildingQuad), and a cluster of >=2
  // additionally gets a subtle unifying border so a block reads as one
  // neighbourhood. The border draws first (below the sprites); the fx ease-in
  // hook applies to every house sprite.
  // House cluster borders draw as a flat iso diamond ring under each member,
  // just below it in depth (so the sprite lands on top).
  for (const cluster of clusterBuildings(scene.buildings, "house")) {
    for (const m of cluster.members) {
      const d = iso.isoFootprintDiamondBox(m.x, m.y, m.w, m.h, 0);
      renderer.push(isoDiamondSprite(d.x, d.y, d.width, d.height, packTint(EDG.cream, Math.round(0xff * 0.18)), LAYER_ENTITY, d.depth - 0.0002));
      // Phase A cozy pivot: a warm hearth light-pool whose strength scales with
      // the house's mood — a content home glows amber, a neglected one stays
      // dark/cold (alpha 0). Same flat iso-diamond pattern as the cluster border,
      // stacked just ABOVE it (and still below the sprite) so the warmth pools on
      // the ground around the house. v1 is a CONSTANT subtle glow (not
      // night-modulated): `pushScene` has no day/night signal threaded in, and the
      // separate night light-pool layer (pushLightPool) composes over this anyway.
      const glow = glowAlphaForMood(m.mood);
      if (glow > 0) {
        renderer.push(isoDiamondSprite(d.x, d.y, d.width, d.height, packTint(EDG.gold, Math.round(0xff * glow)), LAYER_ENTITY, d.depth - 0.0001));
      }
    }
    for (const b of cluster.members) {
      pushBuilding(renderer, iso, b, fx, clockMs, nightFactor);
    }
  }

  for (const b of scene.buildings) {
    if (b.type === "road" || b.type === "wall" || b.type === "bridge") continue; // handled by pushNetworks
    if (b.type === "house") continue; // handled by the cluster path above
    pushBuilding(renderer, iso, b, fx, clockMs, nightFactor);
  }
  for (const v of scene.villagers) {
    // Part A: a villager appears on the map ONLY while travelling between places.
    // A stationary villager (idle at home / working) is represented by its
    // building's occupancy badge instead of a free dot on the road. Same rule the
    // snapshot uses to tally occupancy, so a villager is shown in exactly one
    // place (road OR a building), never both.
    if (!isTravellingFsm(v.fsm)) continue;
    const base = villagerQuad(v, clockMs);
    const dy = fx?.villagerYOffset !== undefined ? fx.villagerYOffset(v) : 0;
    // Render-only position interpolation: glide between snapshot tiles instead of
    // snapping. The hook returns a fractional tile position; isoPointBox handles
    // fractional coords (and derives the correct iso depth from them).
    const p = fx?.villagerPos !== undefined ? fx.villagerPos(v) : { x: v.x, y: v.y };
    const box = iso.isoPointBox(p.x + 0.5, p.y + 0.5, base.width);
    // Entity legibility: lean + squash the figure along its screen-space heading
    // (tracked frame-to-frame, pure render — never read by the sim) so a moving
    // villager reads as walking-with-purpose instead of a static dot.
    const o = villagerHeading.sample(v.id, box.x, box.y);
    // Phase E cozy pivot: a glum villager (low v.mood, sourced from its home
    // house) reads subtly dimmer + sits a hair lower — layered ON TOP of the
    // job tint, which stays the primary read (see villagerQuad's doc comment).
    // Both cues share villagerAlphaForMood/villagerSlumpOffset's mood curve so
    // they move together; neither is randomized (steady mood read, not FX).
    const moodAlpha = villagerAlphaForMood(v.mood);
    const slump = villagerSlumpOffset(v.mood);
    renderer.push({
      atlasId: QUAD_ATLAS_ID,
      frame: base.frame ?? QUAD_FRAME,
      x: box.x + box.width / 2,
      y: box.y + dy + slump + box.height / 2,
      width: box.width * o.sx,
      height: box.height * o.sy,
      rotation: o.lean,
      layer: LAYER_ENTITY,
      alpha: moodAlpha,
      tintRgba: base.tintRgba,
      sortY: box.depth,
    });
  }
  villagerHeading.sweep();
  for (const r of scene.raiders) {
    const base = raiderQuad(r, clockMs);
    const rp = fx?.raiderPos !== undefined ? fx.raiderPos(r) : { x: r.x, y: r.y };
    const box = iso.isoPointBox(rp.x + 0.5, rp.y + 0.5, base.width);
    renderer.push(quadToSprite(
      { x: box.x, y: box.y, width: box.width, height: box.height, tintRgba: base.tintRgba, ...(base.frame !== undefined ? { frame: base.frame } : {}) },
      LAYER_ENTITY, 1, box.depth + 0.0001,
    ));
  }
}

/**
 * Push the road + wall autotile networks (brief 11). Pulls the network quads
 * via `networkQuads` and pushes them on the network layer (above terrain, below
 * buildings). Recomputes per frame — cheap at this world size.
 */
export function pushNetworks(renderer: RendererLike, iso: IsoProjection, buildings: readonly BuildingSnapshot[]): void {
  // Iso: each road/wall/bridge tile draws as a flat diamond filling (a band
  // fraction of) its tile. Adjacent same-network diamonds abut → a run reads
  // continuous without arm geometry. Roads stamp a cobblestone texture and
  // bridges a plank-deck texture (white-tinted so the recipe colors show); walls
  // keep the solid tinted diamond. Drawn on the network layer above terrain.
  for (const t of isoNetworkTiles(buildings, { road: FRAME_ROAD, bridge: FRAME_BRIDGE })) {
    const d = iso.isoFootprintDiamondBox(t.tx, t.ty, 1, 1, 0);
    // Shrink the diamond toward its centre by the band fraction (roads thinner).
    const insetX = (d.width * (1 - t.band)) / 2;
    const insetY = (d.height * (1 - t.band)) / 2;
    // Bridges sit just above the terrain water but BELOW roads/walls so a bridge
    // mouth tucks under the road it meets; textured tiles draw white-tinted.
    const depth = t.type === "bridge" ? d.depth - 0.6 : d.depth - 0.5;
    renderer.push(isoFlatSprite(
      d.x + insetX, d.y + insetY, d.width * t.band, d.height * t.band,
      t.frame ?? FRAME_DIAMOND, t.frame !== undefined ? packTint(EDG.white) : packTint(t.hex),
      LAYER_NETWORK, depth,
    ));
  }
}

export interface GhostPreview {
  tileX: number;
  tileY: number;
  w: number;
  h: number;
  valid: boolean;
}

/**
 * Push the placement ghost + drag-paint preview as translucent quads. Call
 * after `pushScene`, inside the same begin/endFrame.
 */
export function pushGhost(
  renderer: RendererLike,
  iso: IsoProjection,
  ghost: GhostPreview | null,
  dragTiles: ReadonlyArray<{ x: number; y: number; valid?: boolean }>,
): void {
  // Iso ghost: a flat translucent diamond box over the hovered footprint. Use
  // the logical ghostQuad only for its tint, then iso-place it.
  const pushIso = (tileX: number, tileY: number, w: number, h: number, valid: boolean): void => {
    const d = iso.isoFootprintDiamondBox(tileX, tileY, w, h, 0);
    const base = ghostQuad(tileX, tileY, w, h, valid);
    renderer.push(isoDiamondSprite(d.x, d.y, d.width, d.height, base.tintRgba, LAYER_GHOST, d.depth));
  };
  if (ghost !== null) pushIso(ghost.tileX, ghost.tileY, ghost.w, ghost.h, ghost.valid);
  // Drag-paint preview: each tile green (valid) / red (the sim will reject it).
  // `valid` defaults to true so existing callers are unchanged.
  for (const t of dragTiles) pushIso(t.x, t.y, 1, 1, t.valid ?? true);
}

/**
 * Push a service catchment as flat iso ground tiles (OpenTTD-influence brief,
 * 2026-06-22). Each tile stamps a translucent diamond on the coverage layer;
 * perimeter tiles (`edge`) draw brighter so a single building's reach reads as a
 * crisp ring with a faint fill, while a multi-building overlay region (all
 * `edge:false`) reads as a flat wash. The geometry comes from
 * `render/coverage.ts`, which mirrors the sim's coverage math. Call inside the
 * same begin/endFrame as `pushScene`.
 */
export function pushCatchment(
  renderer: RendererLike,
  iso: IsoProjection,
  tiles: ReadonlyArray<{ tx: number; ty: number; edge: boolean }>,
  hex: string,
): void {
  for (const t of tiles) {
    const d = iso.isoFootprintDiamondBox(t.tx, t.ty, 1, 1, 0);
    const alpha = Math.round(0xff * (t.edge ? 0.34 : 0.16));
    renderer.push(isoDiamondSprite(d.x, d.y, d.width, d.height, packTint(hex, alpha), LAYER_COVERAGE, d.depth));
  }
}

/**
 * Stamp a "no road" marker over every building that should be connected to the
 * road network but isn't (road-builder feedback, 2026-06-27). The set comes from
 * `road-feedback.ts` (production / housing / storage that is `connected:false`);
 * infrastructure is never marked. The marker is a small gold chip floating just
 * above the building's roof, gently pulsing on the render clock so it draws the
 * eye without flashing. Render-only — reads the snapshot's `connected` flag.
 * Call inside the same begin/endFrame as `pushScene`.
 */
export function pushDisconnectedMarkers(
  renderer: RendererLike,
  iso: IsoProjection,
  buildings: readonly BuildingSnapshot[],
  clockMs = 0,
): void {
  // Gentle 0.6..1.0 alpha pulse (~1.4 s period) — attention without strobing.
  const pulse = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(clockMs / 1000 * (Math.PI * 2 / 1.4)));
  const alpha = Math.round(0xff * pulse);
  const tint = packTint(EDG.gold, alpha);
  const chip = ISO_TILE_H * 0.55; // small chip, ~half a tile-height square
  for (const b of disconnectedBuildings(buildings)) {
    const box = iso.isoFootprintBox(b.x, b.y, b.w, b.h, buildingHeightTiles(b.type));
    // Centre horizontally on the footprint; float a little above the roof top.
    const cx = box.x + box.width / 2;
    const top = box.y - chip * 0.9;
    // Draw on the disconnect layer with a depth that keeps it above its building.
    renderer.push({
      atlasId: QUAD_ATLAS_ID,
      frame: QUAD_FRAME,
      x: cx,
      y: top,
      width: chip,
      height: chip,
      rotation: Math.PI / 4, // diamond-oriented chip (rhombus pip)
      layer: LAYER_DISCONNECT,
      alpha: 1,
      tintRgba: tint,
      sortY: box.depth + 0.0005,
    });
  }
}

// ---------------------------------------------------------------------------
// Atmosphere push helpers (brief 15 light pool, brief 18 ambient crowd)
// ---------------------------------------------------------------------------

/**
 * Push pre-computed night light-pool glow quads (brief 15). The caller computes
 * them via `lightPoolQuads(...)` in atmosphere.ts; here we just stamp them onto
 * the light-pool layer (above buildings). Each quad already carries its own
 * translucent warm tint. Call inside the same begin/endFrame as `pushScene`.
 */
export function pushLightPool(renderer: RendererLike, iso: IsoProjection, quads: readonly QuadSpec[]): void {
  for (const q of quads) {
    // The glow is a flat pool ON THE GROUND, so stamp the soft `fx/diamond`
    // frame (an iso 2:1 diamond, transparent corners) instead of the `px` solid
    // square — otherwise it reads as a hard orange BOX sitting over the building
    // rather than a radial light pool on the iso grid. Convert the tile-px
    // centre+size the emitter produced into an iso ground box.
    const cxTile = (q.x + q.width / 2) / TILE_SIZE;
    const cyTile = (q.y + q.height / 2) / TILE_SIZE;
    const radiusTiles = Math.max(q.width, q.height) / TILE_SIZE / 2;
    const c = iso.tileCenterToIso(cxTile - 0.5, cyTile - 0.5);
    // An iso diamond spanning `radiusTiles` each way: width = 2·r·ISO_HW, height = 2·r·ISO_HH.
    const halfW = radiusTiles * (ISO_TILE_W / 2);
    const halfH = radiusTiles * (ISO_TILE_H / 2);
    renderer.push(isoFlatSprite(
      c.x - halfW, c.y - halfH, halfW * 2, halfH * 2,
      FRAME_DIAMOND, q.tintRgba, LAYER_LIGHT_POOL, c.y,
    ));
  }
}

/**
 * Push cozy FIRE FX for burning buildings (art-07): a warm ground-glow pool +
 * an animated flame billboard licking up each burning building. The soot/orange
 * cues (wear.ts + buildingQuad's orange tint) still compose UNDER this — the
 * flame is the missing "actually on fire" read. `clockMs` drives the flame
 * flicker frame + the glow breath (render-clock only, deterministic). Call
 * inside the same begin/endFrame as `pushScene`.
 */
export function pushFire(
  renderer: RendererLike,
  iso: IsoProjection,
  buildings: readonly BuildingSnapshot[],
  clockMs: number,
  nightFactor = 0,
): void {
  // Ground-glow pools first (below the flames), stamped like the light pool.
  const glow = fireGlowQuads(buildings, fireFlicker(clockMs), nightFactor);
  for (const q of glow) {
    const cxTile = (q.x + q.width / 2) / TILE_SIZE;
    const cyTile = (q.y + q.height / 2) / TILE_SIZE;
    const radiusTiles = Math.max(q.width, q.height) / TILE_SIZE / 2;
    const c = iso.tileCenterToIso(cxTile - 0.5, cyTile - 0.5);
    const halfW = radiusTiles * (ISO_TILE_W / 2);
    const halfH = radiusTiles * (ISO_TILE_H / 2);
    renderer.push(isoFlatSprite(c.x - halfW, c.y - halfH, halfW * 2, halfH * 2, FRAME_DIAMOND, q.tintRgba, LAYER_LIGHT_POOL, c.y));
  }
  // Flame billboards: an upright flame sprite over each burning building's body,
  // footprint-scaled, flicker-animated. Drawn on the entity layer with a sortY
  // just in front of the building so it reads licking up the near face.
  for (const b of buildings) {
    if (!b.burning && !b.onFire) continue;
    const box = iso.isoFootprintBox(b.x, b.y, b.w, b.h, buildingHeightTiles(b.type));
    // Flame ~60% the building height, centred, rising from the mid-body.
    const fh = box.height * 0.6;
    const fw = fh * (16 / 24); // flame recipe is 16×24
    const fx = box.x + box.width / 2 - fw / 2;
    const fy = box.y + box.height - fh; // base near the building's foot
    const phaseMs = (b.x * 53 + b.y * 97) % 360; // de-sync neighbouring fires
    const frame = flameFrameAt(clockMs, 360, phaseMs);
    renderer.push(quadToSprite(
      { x: fx, y: fy, width: fw, height: fh, tintRgba: packTint(EDG.white), frame },
      LAYER_ENTITY, 1, box.depth + 0.5, // just in front of the building
    ));
  }
}

/**
 * Push the ambient crowd's pedestrian quads (brief 18) on the crowd layer
 * (below real villagers, above buildings). The caller pulls them from
 * `CitadelAmbientCrowd.quads()`. Each quad's `x/y` is the figure's world-px
 * FOOT position (a road tile centre); we iso-project that tile point and stand
 * the small `vil/pedestrian` billboard upright on it (like a villager), so the
 * crowd reads as little walking people rather than flat dots. The clothing tint
 * carried on the quad recolors the shared sprite's white tunic.
 */
export function pushAmbientCrowd(renderer: RendererLike, iso: IsoProjection, quads: readonly QuadSpec[]): void {
  for (const q of quads) {
    const box = iso.isoPointBox(q.x / TILE_SIZE, q.y / TILE_SIZE, q.width);
    renderer.push({
      atlasId: QUAD_ATLAS_ID,
      frame: q.frame ?? QUAD_FRAME,
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
      width: box.width,
      height: box.height,
      rotation: q.lean ?? 0, // entity-legibility lean along heading
      layer: LAYER_AMBIENT_CROWD,
      alpha: 1,
      tintRgba: q.tintRgba,
      sortY: box.depth,
    });
  }
}
