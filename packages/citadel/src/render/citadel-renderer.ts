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
 */
import {
  EDG,
  rgbOf,
  Camera2D,
  createRenderer,
  MIN_ZOOM,
  MAX_ZOOM,
} from "@engine/core";
import type { RendererLike, Canvas2dSprite, LoadedAtlasImage, Ctx2D } from "@engine/core";
import {
  TerrainType,
  TILE_SIZE,
  WORLD_WIDTH,
  WORLD_HEIGHT,
} from "@citadel/sim-core";
import type {
  TerrainGrid,
  BuildingSnapshot,
  VillagerSnapshot,
  RaiderSnapshot,
} from "@citadel/sim-core";

// ---------------------------------------------------------------------------
// World constants
// ---------------------------------------------------------------------------
export const WORLD_PX_W = WORLD_WIDTH * TILE_SIZE;
export const WORLD_PX_H = WORLD_HEIGHT * TILE_SIZE;

/** The atlas id for the generated 1×1 white quad sheet. */
export const QUAD_ATLAS_ID = "citadel-quads";
/** The single frame name in that atlas. */
export const QUAD_FRAME = "px";

// Sprite layers — higher draws on top. Terrain is the baked static layer
// (below everything); these stack buildings < villagers < raiders < ghost.
const LAYER_BUILDING = 10;
const LAYER_VILLAGER = 20;
const LAYER_RAIDER = 30;
const LAYER_GHOST = 40;

/** Ghost / drag-paint preview alpha (translucent over the world). */
const GHOST_ALPHA = Math.round(0xff * 0.45);

// ---------------------------------------------------------------------------
// Color maps (EDG only) — ported verbatim from the deleted Canvas2D renderers.
// ---------------------------------------------------------------------------

/** EDG palette color per terrain type. Covers every TerrainType. */
export const TERRAIN_COLORS: Record<TerrainType, string> = {
  [TerrainType.Grass]: EDG.greenMid,
  [TerrainType.Water]: EDG.skyBlue,
  [TerrainType.Forest]: EDG.greenDark,
  [TerrainType.Stone]: EDG.slate,
  [TerrainType.Rough]: EDG.wood,
};

/** EDG color per building type. */
export const BUILDING_COLORS: Record<string, string> = {
  house: EDG.clay,
  farm: EDG.greenMid,
  mill: EDG.cream,
  bakery: EDG.tan,
  woodcutter: EDG.wood,
  storehouse: EDG.steel,
  road: EDG.navy,
  chapel: EDG.white,
  market: EDG.gold,
  watchpost: EDG.silver,
  tradingpost: EDG.mauve,
  quarry: EDG.slate,
  sawmill: EDG.greenDark,
  smith: EDG.crimson,
  mine: EDG.ink,
  wall: EDG.steel,
  gate: EDG.gold,
  tower: EDG.navy,
  garrison: EDG.blue,
  keep: EDG.plum,
  well: EDG.skyBlue,
  healer: EDG.green,
};

/** EDG color per villager FSM state. */
export const VILLAGER_COLORS: Record<string, string> = {
  idle: EDG.silver,
  walkToWork: EDG.yellow,
  work: EDG.orange,
  haulToStore: EDG.cyan,
  walkHome: EDG.salmon,
};

const FALLBACK_BUILDING_COLOR = EDG.steel;
const FALLBACK_VILLAGER_COLOR = EDG.white;

// ---------------------------------------------------------------------------
// Color packing
// ---------------------------------------------------------------------------

/**
 * Pack an EDG hex string into a `0xRRGGBBAA` int for `Sprite.tintRgba`.
 * `alpha` defaults to fully opaque (0xff). Pure — used by both the renderer
 * and the tests.
 */
export function packTint(hex: string, alpha = 0xff): number {
  const [r, g, b] = rgbOf(hex);
  // >>> 0 keeps the result an unsigned 32-bit int.
  return (((r << 24) | (g << 16) | (b << 8) | (alpha & 0xff)) >>> 0);
}

// ---------------------------------------------------------------------------
// Building → quad mapping (pure, tested)
// ---------------------------------------------------------------------------

export interface QuadSpec {
  /** World-px X of the quad's top-left. */
  x: number;
  /** World-px Y of the quad's top-left. */
  y: number;
  /** Quad width in world px. */
  width: number;
  /** Quad height in world px. */
  height: number;
  /** Packed 0xRRGGBBAA tint. */
  tintRgba: number;
}

/**
 * Map a building snapshot to its solid colored quad (position, footprint, tint).
 *
 * Burning buildings tint orange (matches the old Canvas2D behavior). Roads draw
 * as a centered inset band; gates as a slightly inset gold block; everything
 * else fills its full footprint. Pure — no GPU, returns the quad spec the
 * sprite-batch consumes.
 */
export function buildingQuad(b: BuildingSnapshot): QuadSpec {
  const px = b.x * TILE_SIZE;
  const py = b.y * TILE_SIZE;
  const pw = b.w * TILE_SIZE;
  const ph = b.h * TILE_SIZE;

  if (b.type === "road") {
    const inset = TILE_SIZE * 0.25;
    return {
      x: px + inset,
      y: py + inset,
      width: pw - inset * 2,
      height: ph - inset * 2,
      tintRgba: packTint(BUILDING_COLORS.road ?? FALLBACK_BUILDING_COLOR),
    };
  }

  if (b.type === "gate") {
    const inset = TILE_SIZE * 0.15;
    return {
      x: px + inset,
      y: py + inset,
      width: pw - inset * 2,
      height: ph - inset * 2,
      tintRgba: packTint(BUILDING_COLORS.gate ?? FALLBACK_BUILDING_COLOR),
    };
  }

  const hex = b.burning ? EDG.orange : (BUILDING_COLORS[b.type] ?? FALLBACK_BUILDING_COLOR);
  return { x: px, y: py, width: pw, height: ph, tintRgba: packTint(hex) };
}

/** Map a villager snapshot to a small centered quad (color by FSM state). */
export function villagerQuad(v: VillagerSnapshot): QuadSpec {
  const size = TILE_SIZE * 0.7;
  const cx = v.x * TILE_SIZE + TILE_SIZE / 2;
  const cy = v.y * TILE_SIZE + TILE_SIZE / 2;
  const hex = VILLAGER_COLORS[v.fsm] ?? FALLBACK_VILLAGER_COLOR;
  return { x: cx - size / 2, y: cy - size / 2, width: size, height: size, tintRgba: packTint(hex) };
}

/** Map a raider snapshot to a red quad sized by strength. */
export function raiderQuad(r: RaiderSnapshot): QuadSpec {
  // Strength grows the footprint (matches old radius scaling: 0.4..1.0 tiles).
  const half = TILE_SIZE * (0.4 + Math.min(0.6, r.strength / 60));
  const cx = r.x * TILE_SIZE + TILE_SIZE / 2;
  const cy = r.y * TILE_SIZE + TILE_SIZE / 2;
  return { x: cx - half, y: cy - half, width: half * 2, height: half * 2, tintRgba: packTint(EDG.red) };
}

// ---------------------------------------------------------------------------
// Camera2D transform — screen ↔ world ↔ tile (pure, tested)
// ---------------------------------------------------------------------------

/**
 * The pieces of Camera2D + canvas needed to reproduce the WebGPU renderer's
 * world→screen transform exactly. The GPU renderer (see webgpu/renderer.ts
 * `endFrame`) computes, in DEVICE pixels:
 *   sx = canvasW / worldUnitsX
 *   left = centerX - worldUnitsX / 2
 *   screenPx = worldX * sx - left * sx
 * Inverting: worldX = screenPx / sx + left.
 */
export interface CameraTransform {
  centerX: number;
  centerY: number;
  worldUnitsX: number;
  worldUnitsY: number;
  /** Canvas backing-store width in device px (canvas.width). */
  canvasW: number;
  /** Canvas backing-store height in device px (canvas.height). */
  canvasH: number;
}

/** Snapshot the transform inputs from a live Camera2D + canvas. */
export function transformOf(camera: Camera2D, canvasW: number, canvasH: number): CameraTransform {
  return {
    centerX: camera.centerX,
    centerY: camera.centerY,
    worldUnitsX: camera.worldUnitsX,
    worldUnitsY: camera.worldUnitsY,
    canvasW,
    canvasH,
  };
}

/**
 * Convert a screen-space point (DEVICE px, i.e. already multiplied by dpr and
 * relative to the canvas top-left) to world px. Pure inverse of the GPU
 * renderer's world→screen transform.
 */
export function screenToWorld(t: CameraTransform, screenX: number, screenY: number): { worldX: number; worldY: number } {
  const sx = t.canvasW / t.worldUnitsX;
  const sy = t.canvasH / t.worldUnitsY;
  const left = t.centerX - t.worldUnitsX / 2;
  const top = t.centerY - t.worldUnitsY / 2;
  return {
    worldX: screenX / sx + left,
    worldY: screenY / sy + top,
  };
}

/** Convert a screen-space point (device px) to integer tile coords. */
export function screenToTile(t: CameraTransform, screenX: number, screenY: number): { tx: number; ty: number } {
  const { worldX, worldY } = screenToWorld(t, screenX, screenY);
  return { tx: Math.floor(worldX / TILE_SIZE), ty: Math.floor(worldY / TILE_SIZE) };
}

/**
 * Resolve a mouse event to device-px coordinates relative to the canvas
 * top-left, using the same dpr clamp the GPU renderer uses for its backing
 * store (min(devicePixelRatio, 2)). Lives here so placement-state and the
 * renderer agree on the transform.
 */
export function eventToDevicePx(e: { clientX: number; clientY: number }, canvas: HTMLCanvasElement): { sx: number; sy: number } {
  const dpr = Math.min((typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1), 2);
  const rect = canvas.getBoundingClientRect();
  return {
    sx: (e.clientX - rect.left) * dpr,
    sy: (e.clientY - rect.top) * dpr,
  };
}

// ---------------------------------------------------------------------------
// Camera fitting + zoom
// ---------------------------------------------------------------------------

export function clampZoom(z: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}

/**
 * Keep the camera's visible world units matched to the canvas aspect ratio so
 * the (independent x/y) GPU scale doesn't stretch sprites, while fitting the
 * whole world at zoom=1. Re-derives the base world-units from the canvas and
 * applies the current zoom. Call each frame before draw (canvas may resize).
 */
export function fitCameraToCanvas(camera: Camera2D, canvasW: number, canvasH: number): void {
  if (canvasW <= 0 || canvasH <= 0) return;
  const canvasAspect = canvasW / canvasH;
  const worldAspect = WORLD_PX_W / WORLD_PX_H;
  // Base units cover the whole world (letterbox-fit), aspect-corrected.
  let baseX: number;
  let baseY: number;
  if (canvasAspect >= worldAspect) {
    baseY = WORLD_PX_H;
    baseX = WORLD_PX_H * canvasAspect;
  } else {
    baseX = WORLD_PX_W;
    baseY = WORLD_PX_W / canvasAspect;
  }
  const z = camera.zoom;
  camera.worldUnitsX = baseX / z;
  camera.worldUnitsY = baseY / z;
}

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
// Terrain bake (static-layer decorate callback)
// ---------------------------------------------------------------------------

/**
 * Build the decorate callback that paints the terrain grid into the baked
 * static layer (a one-time texture on the WebGPU backend). Each cell is a
 * TILE_SIZE×TILE_SIZE EDG-colored rect — same logic as the old
 * `bakeTerrainLayer`, but drawn into the engine's bake surface.
 */
export function makeTerrainDecorate(grid: TerrainGrid): (ctx: Ctx2D, wpx: number, hpx: number) => void {
  return (ctx: Ctx2D): void => {
    for (let ty = 0; ty < grid.height; ty++) {
      for (let tx = 0; tx < grid.width; tx++) {
        const t = grid.cells[ty * grid.width + tx] as TerrainType;
        ctx.fillStyle = TERRAIN_COLORS[t] ?? EDG.green;
        ctx.fillRect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Renderer setup
// ---------------------------------------------------------------------------

export interface CitadelRenderer {
  renderer: RendererLike;
  camera: Camera2D;
}

/**
 * Create the WebGPU-backed citadel renderer: force the WebGPU backend (the FV
 * pattern), register the generated quad atlas, set the clear color, and bake
 * the terrain backdrop once. Throws if WebGPU is unavailable (no silent
 * Canvas2D fallback — Citadel is WebGPU-only at runtime).
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

  const atlas = await createQuadAtlas();
  renderer.addAtlas(atlas);

  // Bake terrain once into the static layer (texture on WebGPU).
  renderer.bakeStaticLayer([], WORLD_PX_W, WORLD_PX_H, makeTerrainDecorate(terrain));

  return { renderer, camera };
}

// ---------------------------------------------------------------------------
// Per-frame scene draw
// ---------------------------------------------------------------------------

export interface SceneInput {
  buildings: readonly BuildingSnapshot[];
  villagers: readonly VillagerSnapshot[];
  raiders: readonly RaiderSnapshot[];
}

/** Build the Sprite the sprite-batch consumes from a QuadSpec + layer. */
function quadToSprite(q: QuadSpec, layer: number): Canvas2dSprite {
  return {
    atlasId: QUAD_ATLAS_ID,
    frame: QUAD_FRAME,
    x: q.x,
    y: q.y,
    width: q.width,
    height: q.height,
    rotation: 0,
    layer,
    alpha: 1,
    tintRgba: q.tintRgba,
  };
}

/**
 * Push one frame's worth of building / villager / raider quads. Does NOT call
 * begin/endFrame — the caller owns the frame lifecycle so it can attach the
 * overlay. Pure-ish: only calls `renderer.push`.
 */
export function pushScene(renderer: RendererLike, scene: SceneInput): void {
  for (const b of scene.buildings) renderer.push(quadToSprite(buildingQuad(b), LAYER_BUILDING));
  for (const v of scene.villagers) renderer.push(quadToSprite(villagerQuad(v), LAYER_VILLAGER));
  for (const r of scene.raiders) renderer.push(quadToSprite(raiderQuad(r), LAYER_RAIDER));
}

export interface GhostPreview {
  tileX: number;
  tileY: number;
  w: number;
  h: number;
  valid: boolean;
}

/**
 * Map a ghost-preview cell to a translucent colored quad (green = valid,
 * red = invalid). Pure — used by `pushGhost` and the tests.
 *
 * NOTE: the ghost is drawn as a **sprite-batch quad**, not via the `endFrame`
 * overlay callback. The WebGPU renderer's `endFrame(overlay)` parameter is a
 * no-op (it only uses its overlay canvas for particles / weather / wash — see
 * webgpu/renderer.ts), so an OverlayFn would never render on the backend
 * Citadel actually uses at runtime. A translucent quad in the sprite-batch is
 * the path that works on WebGPU and keeps everything going through brief 20's
 * batch.
 */
export function ghostQuad(tileX: number, tileY: number, w: number, h: number, valid: boolean): QuadSpec {
  return {
    x: tileX * TILE_SIZE,
    y: tileY * TILE_SIZE,
    width: w * TILE_SIZE,
    height: h * TILE_SIZE,
    tintRgba: packTint(valid ? EDG.green : EDG.red, GHOST_ALPHA),
  };
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
  if (ghost !== null) {
    renderer.push(quadToSprite(ghostQuad(ghost.tileX, ghost.tileY, ghost.w, ghost.h, ghost.valid), LAYER_GHOST));
  }
  for (const t of dragTiles) {
    renderer.push(quadToSprite(ghostQuad(t.x, t.y, 1, 1, true), LAYER_GHOST));
  }
}
