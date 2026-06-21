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
import type { RendererLike, LoadedAtlasImage, Canvas2dSprite } from "@engine/core";
import { TILE_SIZE } from "@citadel/sim-core";
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
import { isoFootprintBox, isoFootprintDiamondBox, isoPointBox, isoProjectTilePxBox, ISO_TILE_H } from "./iso";
import { isoNetworkTiles } from "./autotile";
import { FRAME_DIAMOND } from "./sprites/recipes";
import { clusterBuildings, clusterBorderQuads } from "./clustering";
import { makeTerrainDecorate } from "./terrain-dither";
import { RenderWindowController } from "./window-controller";
import { createCitadelSpriteAtlas } from "./sprites/atlas";

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
import { WORLD_PX_W, WORLD_PX_H } from "./transform";

// Sprite layers — higher draws on top. Terrain is the baked static layer
// (below everything); these stack buildings < villagers < raiders < ghost.
const LAYER_SHADOW = 8;
// Isometric: buildings, villagers, and raiders share ONE entity layer so they
// inter-sort back-to-front by their iso depth (set as each sprite's `sortY`),
// which is what makes a villager in front correctly occlude a building behind.
const LAYER_ENTITY = 10;
const LAYER_GHOST = 40;
/** Atmosphere layers (brief 15/18). Light pool sits just above buildings so the
 *  warm glow pools over the ground + structures; the ambient crowd walks below
 *  the real villagers but above buildings. */
const LAYER_LIGHT_POOL = 12;
const LAYER_AMBIENT_CROWD = 15;

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
  const camera = new Camera2D({
    worldUnitsX: WORLD_PX_W,
    worldUnitsY: WORLD_PX_H,
    centerX: WORLD_PX_W / 2,
    centerY: WORLD_PX_H / 2,
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
  const windowController = new RenderWindowController(renderer, terrain);
  windowController.bakeInitial(camera);

  return { renderer, camera, windowController };
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
 */
export interface SceneFx {
  building?: (b: BuildingSnapshot, quad: QuadSpec) => { quad: QuadSpec; alpha: number };
  villagerYOffset?: (v: VillagerSnapshot) => number;
}

/**
 * Per-type sprite art height in tiles (how far the building "rises" above its
 * ground diamond in the iso view). Taller structures loom; flat features stay
 * ground-height. Falls back to 1. Render-only.
 */
// MUST match the `heightTiles` authored per type in sprites/recipes/buildings.ts
// so the sprite art maps 1:1 onto the quad (shared isoSpriteDims).
const BUILDING_HEIGHT_TILES: Record<string, number> = {
  keep: 3, tower: 3, garrison: 2, watchpost: 2, chapel: 2, mill: 2,
  "town-hall": 2,
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
function isoBuildingPlacement(b: BuildingSnapshot, base: QuadSpec): { quad: QuadSpec; depth: number } {
  const box = isoFootprintBox(b.x, b.y, b.w, b.h, buildingHeightTiles(b.type));
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
  return { atlasId: QUAD_ATLAS_ID, frame: FRAME_DIAMOND, x, y, width, height, rotation: 0, layer, alpha: 1, tintRgba, sortY };
}

/** Push one building's sprite quad, applying the optional placement ease-in fx. */
function pushBuilding(renderer: RendererLike, b: BuildingSnapshot, fx?: SceneFx): void {
  const base = buildingQuad(b);
  const { quad: isoBase, depth } = isoBuildingPlacement(b, base);

  // Directional ground shadow: a flat iso diamond-ish box under the footprint.
  // Flat features (road/wall/gate) cast none.
  if (buildingShadowQuad(b) !== null) {
    const d = isoFootprintDiamondBox(b.x, b.y, b.w, b.h, 0);
    renderer.push(isoDiamondSprite(d.x + SHADOW_OFFSET, d.y + SHADOW_OFFSET, d.width, d.height, packTint(EDG.ink, SHADOW_ALPHA), LAYER_ENTITY, depth - 0.0001));
  }

  if (fx?.building !== undefined) {
    // The fx ease-in scales/fades about the footprint centre — apply it to the
    // iso-placed quad so the animation still reads.
    const { quad, alpha } = fx.building(b, isoBase);
    renderer.push(quadToSprite(quad, LAYER_ENTITY, alpha, depth));
  } else {
    renderer.push(quadToSprite(isoBase, LAYER_ENTITY, 1, depth));
  }
}

/**
 * Push one frame's worth of building / villager / raider quads. Does NOT call
 * begin/endFrame — the caller owns the frame lifecycle so it can attach the
 * overlay. Pure-ish: only calls `renderer.push`. The optional `fx` hooks apply
 * the placement ease-in (building scale/alpha) and idle bob (villager Y).
 */
export function pushScene(renderer: RendererLike, scene: SceneInput, fx?: SceneFx): void {
  // Roads + walls draw as autotiled connected networks (brief 11), not per-tile
  // through buildingQuad. Gates still draw their distinct gold block here.
  pushNetworks(renderer, scene.buildings);

  // Houses route through the BFS clustering path (brief 12): each house now
  // draws as its own pixel-art sprite (via buildingQuad), and a cluster of >=2
  // additionally gets a subtle unifying border so a block reads as one
  // neighbourhood. The border draws first (below the sprites); the fx ease-in
  // hook applies to every house sprite.
  // House cluster borders draw as a flat iso diamond ring under each member,
  // just below it in depth (so the sprite lands on top).
  for (const cluster of clusterBuildings(scene.buildings, "house")) {
    for (const m of cluster.members) {
      const d = isoFootprintDiamondBox(m.x, m.y, m.w, m.h, 0);
      renderer.push(isoDiamondSprite(d.x, d.y, d.width, d.height, packTint(EDG.cream, Math.round(0xff * 0.18)), LAYER_ENTITY, d.depth - 0.0002));
    }
    for (const b of cluster.members) {
      pushBuilding(renderer, b, fx);
    }
  }

  for (const b of scene.buildings) {
    if (b.type === "road" || b.type === "wall") continue; // handled by pushNetworks
    if (b.type === "house") continue; // handled by the cluster path above
    pushBuilding(renderer, b, fx);
  }
  for (const v of scene.villagers) {
    const base = villagerQuad(v);
    const dy = fx?.villagerYOffset !== undefined ? fx.villagerYOffset(v) : 0;
    const box = isoPointBox(v.x + 0.5, v.y + 0.5, base.width);
    renderer.push(quadToSprite(
      { x: box.x, y: box.y + dy, width: box.width, height: box.height, tintRgba: base.tintRgba, ...(base.frame !== undefined ? { frame: base.frame } : {}) },
      LAYER_ENTITY, 1, box.depth,
    ));
  }
  for (const r of scene.raiders) {
    const base = raiderQuad(r);
    const box = isoPointBox(r.x + 0.5, r.y + 0.5, base.width);
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
export function pushNetworks(renderer: RendererLike, buildings: readonly BuildingSnapshot[]): void {
  // Iso: each road/wall tile draws as a flat diamond filling (a band fraction
  // of) its tile. Adjacent same-network diamonds abut → a run reads continuous
  // without arm geometry. Drawn on the network layer just above terrain.
  for (const t of isoNetworkTiles(buildings)) {
    const d = isoFootprintDiamondBox(t.tx, t.ty, 1, 1, 0);
    // Shrink the diamond toward its centre by the band fraction (roads thinner).
    const insetX = (d.width * (1 - t.band)) / 2;
    const insetY = (d.height * (1 - t.band)) / 2;
    renderer.push(isoDiamondSprite(
      d.x + insetX, d.y + insetY, d.width * t.band, d.height * t.band,
      packTint(t.hex), LAYER_NETWORK, d.depth - 0.5,
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
  ghost: GhostPreview | null,
  dragTiles: ReadonlyArray<{ x: number; y: number }>,
): void {
  // Iso ghost: a flat translucent diamond box over the hovered footprint. Use
  // the logical ghostQuad only for its tint, then iso-place it.
  const pushIso = (tileX: number, tileY: number, w: number, h: number, valid: boolean): void => {
    const d = isoFootprintDiamondBox(tileX, tileY, w, h, 0);
    const base = ghostQuad(tileX, tileY, w, h, valid);
    renderer.push(isoDiamondSprite(d.x, d.y, d.width, d.height, base.tintRgba, LAYER_GHOST, d.depth));
  };
  if (ghost !== null) pushIso(ghost.tileX, ghost.tileY, ghost.w, ghost.h, ghost.valid);
  for (const t of dragTiles) pushIso(t.x, t.y, 1, 1, true);
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
export function pushLightPool(renderer: RendererLike, quads: readonly QuadSpec[]): void {
  for (const q of quads) {
    const box = isoProjectTilePxBox(q.x, q.y, q.width, q.height, TILE_SIZE);
    renderer.push(quadToSprite({ x: box.x, y: box.y, width: box.width, height: box.height, tintRgba: q.tintRgba }, LAYER_LIGHT_POOL));
  }
}

/**
 * Push the ambient crowd's pedestrian quads (brief 18) on the crowd layer
 * (below real villagers, above buildings). The caller pulls them from
 * `CitadelAmbientCrowd.quads()`.
 */
export function pushAmbientCrowd(renderer: RendererLike, quads: readonly QuadSpec[]): void {
  for (const q of quads) {
    const box = isoProjectTilePxBox(q.x, q.y, q.width, q.height, TILE_SIZE);
    renderer.push(quadToSprite({ x: box.x, y: box.y, width: box.width, height: box.height, tintRgba: q.tintRgba }, LAYER_AMBIENT_CROWD));
  }
}
