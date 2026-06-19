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
/** Atmosphere layers (brief 15/18). Light pool sits just above buildings so the
 *  warm glow pools over the ground + structures; the ambient crowd walks below
 *  the real villagers but above buildings. */
const LAYER_LIGHT_POOL = 12;
const LAYER_AMBIENT_CROWD = 15;

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

// ---------------------------------------------------------------------------
// Adjacency autotiling for roads & walls (brief 11) — pure, tested
// ---------------------------------------------------------------------------
//
// Roads and walls render as connected runs instead of loose squares by
// computing a 4-neighbour bitmask per tile and drawing a center block plus an
// "arm" quad toward each connected neighbour. Adjacent tiles' arms meet at the
// shared edge, so a network visually fuses into straight / L / T / cross /
// dead-end shapes.
//
// Bitmask bit layout (N|E|S|W):
//   N = 1, E = 2, S = 4, W = 8
// so e.g. mask 0b0101 = N|S = a vertical straight; 0b0011 = N|E = an L-corner.
//
// GATE DECISION: gates count as wall neighbours, so a wall run continues
// *through* a gate (reads better — the perimeter looks unbroken). Roads do NOT
// treat gates as road, and walls do NOT treat roads as wall — each network is
// independent, except walls additionally absorb gate tiles into their set.
//
// PERF: masks are recomputed every frame from the building snapshot. The world
// is <=96×96 and road+wall tiles are a small fraction, well under the brief's
// ~1000-tile budget, so recompute-per-frame is fine and avoids cache
// invalidation on placement commands.

/** Direction bits for the 4-neighbour autotile mask. */
export const DIR_N = 1;
export const DIR_E = 2;
export const DIR_S = 4;
export const DIR_W = 8;

/** Road network layer (drawn above terrain, below buildings). */
const LAYER_NETWORK = 5;

/** Build a Set of packed tile keys (`ty*WORLD_WIDTH+tx`) for a 1×1 tile list. */
export function tileKey(tx: number, ty: number): number {
  return ty * WORLD_WIDTH + tx;
}

/**
 * Compute the 4-neighbour connectivity mask for the tile (tx,ty) given the set
 * of connected-network tile keys. Pure.
 */
export function neighbourMask(tx: number, ty: number, members: ReadonlySet<number>): number {
  let mask = 0;
  if (members.has(tileKey(tx, ty - 1))) mask |= DIR_N;
  if (members.has(tileKey(tx + 1, ty))) mask |= DIR_E;
  if (members.has(tileKey(tx, ty + 1))) mask |= DIR_S;
  if (members.has(tileKey(tx - 1, ty))) mask |= DIR_W;
  return mask;
}

/**
 * Expand a tile + connectivity mask into autotile quads: a center block plus an
 * arm quad toward each connected neighbour. `band` is the fraction of the tile
 * occupied by the band thickness (roads thinner, walls thicker). Pure — no GPU.
 *
 * The center block is `band`-sized and centered; each arm fills from the center
 * to the tile edge in its direction, at `band` thickness. Two adjacent tiles'
 * arms therefore meet exactly at the shared tile edge and read as fused.
 */
export function autotileQuads(tileX: number, tileY: number, mask: number, hex: string, band: number): QuadSpec[] {
  const tint = packTint(hex);
  const px = tileX * TILE_SIZE;
  const py = tileY * TILE_SIZE;
  const thick = TILE_SIZE * band;
  const off = (TILE_SIZE - thick) / 2; // inset of the band from the tile edge
  const quads: QuadSpec[] = [];

  // Center block — always present (an isolated tile renders as just this).
  quads.push({ x: px + off, y: py + off, width: thick, height: thick, tintRgba: tint });

  // North arm: from the tile's top edge down to the center block top.
  if (mask & DIR_N) {
    quads.push({ x: px + off, y: py, width: thick, height: off, tintRgba: tint });
  }
  // South arm: from the center block bottom down to the tile's bottom edge.
  if (mask & DIR_S) {
    quads.push({ x: px + off, y: py + off + thick, width: thick, height: off, tintRgba: tint });
  }
  // West arm: from the tile's left edge to the center block left.
  if (mask & DIR_W) {
    quads.push({ x: px, y: py + off, width: off, height: thick, tintRgba: tint });
  }
  // East arm: from the center block right to the tile's right edge.
  if (mask & DIR_E) {
    quads.push({ x: px + off + thick, y: py + off, width: off, height: thick, tintRgba: tint });
  }
  return quads;
}

/** Road band fraction (thin) and wall band fraction (thick). */
const ROAD_BAND = 0.5;
const WALL_BAND = 0.8;

/**
 * Pull road / wall tiles out of the building snapshot, compute connectivity
 * masks, and return the autotile quads for both networks. Gates are added to
 * the wall set (continuous-through-gate) but the gate's own tile keeps its
 * distinct gold draw via `buildingQuad`, so we don't emit wall quads for gate
 * cells themselves — only the wall tiles get autotile quads, computed against a
 * member set that *includes* gates.
 *
 * Returns the quads so `pushNetworks` (and the tests) can consume them. Pure.
 */
export function networkQuads(buildings: readonly BuildingSnapshot[]): QuadSpec[] {
  const roadTiles: Array<{ tx: number; ty: number }> = [];
  const wallTiles: Array<{ tx: number; ty: number }> = [];
  const roadSet = new Set<number>();
  const wallSet = new Set<number>();

  // First pass: build membership sets. Walls + gates both join the wall set so
  // a run continues through a gate; roads are their own set.
  for (const b of buildings) {
    // Footprints can exceed 1×1; key every covered tile.
    for (let dy = 0; dy < b.h; dy++) {
      for (let dx = 0; dx < b.w; dx++) {
        const tx = b.x + dx;
        const ty = b.y + dy;
        const key = tileKey(tx, ty);
        if (b.type === "road") {
          roadSet.add(key);
          roadTiles.push({ tx, ty });
        } else if (b.type === "wall") {
          wallSet.add(key);
          wallTiles.push({ tx, ty });
        } else if (b.type === "gate") {
          // Gate joins the wall set (continuous run) but is drawn by buildingQuad.
          wallSet.add(key);
        }
      }
    }
  }

  const quads: QuadSpec[] = [];
  const roadHex = BUILDING_COLORS.road ?? FALLBACK_BUILDING_COLOR;
  const wallHex = BUILDING_COLORS.wall ?? FALLBACK_BUILDING_COLOR;
  for (const { tx, ty } of roadTiles) {
    quads.push(...autotileQuads(tx, ty, neighbourMask(tx, ty, roadSet), roadHex, ROAD_BAND));
  }
  for (const { tx, ty } of wallTiles) {
    quads.push(...autotileQuads(tx, ty, neighbourMask(tx, ty, wallSet), wallHex, WALL_BAND));
  }
  return quads;
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
        // Sub-tile dither (brief 13): deterministic darker/lighter clusters so
        // same-type cells don't look stamped. Baked once — zero per-frame cost.
        for (const c of ditherClusters(tx, ty, t)) {
          ctx.fillStyle = c.hex;
          ctx.fillRect(tx * TILE_SIZE + c.x, ty * TILE_SIZE + c.y, c.size, c.size);
        }
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Sub-tile terrain dither (brief 13) — pure, deterministic, tested
// ---------------------------------------------------------------------------
//
// Each terrain cell gets 1–3 small darker/lighter pixel clusters, chosen by a
// pure integer hash of (tx, ty, type). No RNG, no Math.random — identical every
// frame, never persisted to save data (it's a render-only bake decoration).

/**
 * Cheap pure integer coordinate hash → unsigned 32-bit int. Mixes tx, ty, type
 * with distinct odd multipliers + an xorshift finalizer so adjacent cells and
 * different types diverge. Self-contained (no sim dependency) by design.
 */
export function ditherHash(tx: number, ty: number, type: number): number {
  let h = (tx * 0x1f1f1f1f) ^ (ty * 0x8da6b343) ^ (type * 0xd2511f53);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}

/** A darker + lighter EDG accent swatch per terrain type. */
export interface DitherAccents {
  /** Darker EDG swatch hex. */
  dark: string;
  /** Lighter EDG swatch hex. */
  light: string;
}

/**
 * Per-terrain-type dither accents: a darker and a lighter EDG swatch flanking
 * the base TERRAIN_COLORS hue. Covers every TerrainType. EDG-only.
 */
export const DITHER_ACCENTS: Record<TerrainType, DitherAccents> = {
  [TerrainType.Grass]: { dark: EDG.greenDark, light: EDG.green },
  [TerrainType.Water]: { dark: EDG.blue, light: EDG.cyan },
  [TerrainType.Forest]: { dark: EDG.teal, light: EDG.greenMid },
  [TerrainType.Stone]: { dark: EDG.ink, light: EDG.steel },
  [TerrainType.Rough]: { dark: EDG.woodDark, light: EDG.tan },
};

const FALLBACK_ACCENTS: DitherAccents = { dark: EDG.ink, light: EDG.white };

/** Resolve the dither accents for a terrain type (pure, total). */
export function ditherAccents(type: TerrainType): DitherAccents {
  return DITHER_ACCENTS[type] ?? FALLBACK_ACCENTS;
}

/** A single dither cluster: a small filled square at (x,y) within the cell. */
export interface DitherCluster {
  /** X offset within the cell, px. */
  x: number;
  /** Y offset within the cell, px. */
  y: number;
  /** Square side length, px. */
  size: number;
  /** EDG accent hex (dark or light). */
  hex: string;
}

/**
 * Deterministically derive the 1–3 dither clusters for a cell from the pure
 * coordinate hash. Cluster count, positions (snapped to a 4px sub-grid so they
 * stay crisp at TILE_SIZE=16), sizes (1–2px), and dark/light choice all come
 * from disjoint bit-fields of the hash → identical every call. Pure.
 */
export function ditherClusters(tx: number, ty: number, type: TerrainType): DitherCluster[] {
  const accents = ditherAccents(type);
  const h = ditherHash(tx, ty, type);
  const count = 1 + (h & 0x3) % 3; // 1..3
  const clusters: DitherCluster[] = [];
  // 4px sub-grid → 4 columns/rows of cells at TILE_SIZE=16, keeps stamps inset.
  const cells = TILE_SIZE / 4; // 4
  for (let i = 0; i < count; i++) {
    // Each cluster consumes a fresh 8-bit slice of the hash.
    const slice = (h >>> (i * 8)) & 0xff;
    const gx = slice & 0x3; // 0..3 grid col
    const gy = (slice >>> 2) & 0x3; // 0..3 grid row
    const size = 1 + ((slice >>> 4) & 0x1); // 1..2 px
    const light = ((slice >>> 5) & 0x1) === 1;
    clusters.push({
      x: gx * cells,
      y: gy * cells,
      size,
      hex: light ? accents.light : accents.dark,
    });
  }
  return clusters;
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
function quadToSprite(q: QuadSpec, layer: number, alpha = 1): Canvas2dSprite {
  return {
    atlasId: QUAD_ATLAS_ID,
    frame: QUAD_FRAME,
    x: q.x,
    y: q.y,
    width: q.width,
    height: q.height,
    rotation: 0,
    layer,
    alpha,
    tintRgba: q.tintRgba,
  };
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
 * Push one frame's worth of building / villager / raider quads. Does NOT call
 * begin/endFrame — the caller owns the frame lifecycle so it can attach the
 * overlay. Pure-ish: only calls `renderer.push`. The optional `fx` hooks apply
 * the placement ease-in (building scale/alpha) and idle bob (villager Y).
 */
export function pushScene(renderer: RendererLike, scene: SceneInput, fx?: SceneFx): void {
  // Roads + walls draw as autotiled connected networks (brief 11), not per-tile
  // through buildingQuad. Gates still draw their distinct gold block here.
  pushNetworks(renderer, scene.buildings);
  for (const b of scene.buildings) {
    if (b.type === "road" || b.type === "wall") continue; // handled by pushNetworks
    const base = buildingQuad(b);
    if (fx?.building !== undefined) {
      const { quad, alpha } = fx.building(b, base);
      renderer.push(quadToSprite(quad, LAYER_BUILDING, alpha));
    } else {
      renderer.push(quadToSprite(base, LAYER_BUILDING));
    }
  }
  for (const v of scene.villagers) {
    const q = villagerQuad(v);
    const dy = fx?.villagerYOffset !== undefined ? fx.villagerYOffset(v) : 0;
    renderer.push(quadToSprite(dy !== 0 ? { ...q, y: q.y + dy } : q, LAYER_VILLAGER));
  }
  for (const r of scene.raiders) renderer.push(quadToSprite(raiderQuad(r), LAYER_RAIDER));
}

/**
 * Push the road + wall autotile networks (brief 11). Pulls the network quads
 * via `networkQuads` and pushes them on the network layer (above terrain, below
 * buildings). Recomputes per frame — cheap at this world size.
 */
export function pushNetworks(renderer: RendererLike, buildings: readonly BuildingSnapshot[]): void {
  for (const q of networkQuads(buildings)) renderer.push(quadToSprite(q, LAYER_NETWORK));
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
  for (const q of quads) renderer.push(quadToSprite(q, LAYER_LIGHT_POOL));
}

/**
 * Push the ambient crowd's pedestrian quads (brief 18) on the crowd layer
 * (below real villagers, above buildings). The caller pulls them from
 * `CitadelAmbientCrowd.quads()`.
 */
export function pushAmbientCrowd(renderer: RendererLike, quads: readonly QuadSpec[]): void {
  for (const q of quads) renderer.push(quadToSprite(q, LAYER_AMBIENT_CROWD));
}
