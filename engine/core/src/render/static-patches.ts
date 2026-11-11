/**
 * Static-layer patches: the pure half (no GL, no canvas), tested headlessly.
 *
 * One texture caps a static layer at the device's `MAX_TEXTURE_SIZE`. Past that the layer is
 * cut into a grid of **patches** (corpus glossary): fixed-size squares, each its own texture,
 * each baked from its own world region the first time it comes into view, and freed again once
 * the camera is far from it. GPU memory then follows the view, not the world.
 *
 * This module decides the grid, which patches a view needs, which to bake ahead (one ring
 * round the view) and which to free (two rings out or further). The GL half is
 * `webgl2/static-layer-pass.ts`.
 */
import type { Sprite } from "./sprite-types";
import type { StaticRegion } from "./static-region";

/**
 * The patch edge when the device allows it. WebGL2 guarantees `MAX_TEXTURE_SIZE >= 2048`, so in
 * practice this is always the size; `patchSizeFor` still takes the smaller of the two.
 */
export const DEFAULT_PATCH_SIZE = 2048;

/**
 * The largest static layer kept as one texture. Past it the layer is patched even when the device
 * could hold it whole: 4096 px is what nearly every device supports, and patches keep a big
 * world's memory to the view instead of the world (one 7680 px texture is 225 MB). Farm's
 * 3840 px bake stays one texture.
 */
export const SINGLE_TEXTURE_MAX = 4096;

/** Ring patches baked ahead of need per frame: a pan's next patches arrive without a hitch. */
export const RING_BAKES_PER_FRAME = 1;

/** The patch edge for a device whose texture limit is `textureLimit`. */
export function patchSizeFor(textureLimit: number): number {
  return Math.max(1, Math.min(DEFAULT_PATCH_SIZE, Math.floor(textureLimit)));
}

/** A grid of square patches over a world-px region; edge patches are cropped to the region. */
export interface PatchGrid {
  readonly originX: number;
  readonly originY: number;
  readonly width: number;
  readonly height: number;
  readonly size: number;
  readonly cols: number;
  readonly rows: number;
}

export function patchGrid(region: StaticRegion, size: number): PatchGrid {
  const s = Math.max(1, Math.floor(size));
  return {
    originX: region.originX,
    originY: region.originY,
    width: region.width,
    height: region.height,
    size: s,
    cols: Math.max(1, Math.ceil(region.width / s)),
    rows: Math.max(1, Math.ceil(region.height / s)),
  };
}

/** A patch's id within its grid: row-major. */
export function patchKey(grid: PatchGrid, col: number, row: number): number {
  return row * grid.cols + col;
}

/** The world-px rect patch `key` covers. */
export function patchRect(grid: PatchGrid, key: number): StaticRegion {
  const col = key % grid.cols;
  const row = Math.floor(key / grid.cols);
  const x = col * grid.size;
  const y = row * grid.size;
  return {
    originX: grid.originX + x,
    originY: grid.originY + y,
    width: Math.min(grid.size, grid.width - x),
    height: Math.min(grid.size, grid.height - y),
  };
}

/** An inclusive range of patch columns and rows. */
export interface PatchRange {
  readonly c0: number;
  readonly r0: number;
  readonly c1: number;
  readonly r1: number;
}

/**
 * The patches a visible world rect touches, or null when it misses the grid. A rect that only
 * touches a patch's edge (zero-area overlap) does not count.
 */
export function visiblePatchRange(
  grid: PatchGrid,
  vis: { visL: number; visT: number; visR: number; visB: number },
): PatchRange | null {
  const l = Math.max(vis.visL, grid.originX) - grid.originX;
  const t = Math.max(vis.visT, grid.originY) - grid.originY;
  const r = Math.min(vis.visR, grid.originX + grid.width) - grid.originX;
  const b = Math.min(vis.visB, grid.originY + grid.height) - grid.originY;
  if (r <= l || b <= t) return null;
  return {
    c0: Math.floor(l / grid.size),
    r0: Math.floor(t / grid.size),
    c1: Math.min(grid.cols - 1, Math.ceil(r / grid.size) - 1),
    r1: Math.min(grid.rows - 1, Math.ceil(b / grid.size) - 1),
  };
}

/** What a frame does with its patches. */
export interface PatchPlan {
  /** Every patch the view touches, row-major. Missing ones are baked this frame. */
  readonly visible: readonly number[];
  /** Patches one ring round the view that are not live yet, nearest rows first. */
  readonly ahead: readonly number[];
  /** Live patches two rings or more from the view, to free. */
  readonly evict: readonly number[];
}

/** How many patches a live patch is from the view range (Chebyshev distance; 0 inside it). */
function ringDistance(grid: PatchGrid, key: number, range: PatchRange): number {
  const col = key % grid.cols;
  const row = Math.floor(key / grid.cols);
  const dc = col < range.c0 ? range.c0 - col : col > range.c1 ? col - range.c1 : 0;
  const dr = row < range.r0 ? range.r0 - row : row > range.r1 ? row - range.r1 : 0;
  return Math.max(dc, dr);
}

export function planPatches(grid: PatchGrid, range: PatchRange | null, live: ReadonlySet<number>): PatchPlan {
  if (!range) return { visible: [], ahead: [], evict: [...live] };
  const visible: number[] = [];
  for (let row = range.r0; row <= range.r1; row++) {
    for (let col = range.c0; col <= range.c1; col++) visible.push(patchKey(grid, col, row));
  }
  const ahead: number[] = [];
  const rc0 = Math.max(0, range.c0 - 1);
  const rr0 = Math.max(0, range.r0 - 1);
  const rc1 = Math.min(grid.cols - 1, range.c1 + 1);
  const rr1 = Math.min(grid.rows - 1, range.r1 + 1);
  for (let row = rr0; row <= rr1; row++) {
    for (let col = rc0; col <= rc1; col++) {
      if (col >= range.c0 && col <= range.c1 && row >= range.r0 && row <= range.r1) continue;
      const key = patchKey(grid, col, row);
      if (!live.has(key)) ahead.push(key);
    }
  }
  const evict: number[] = [];
  for (const key of live) if (ringDistance(grid, key, range) >= 2) evict.push(key);
  return { visible, ahead, evict };
}

/**
 * A sprite's world-px bounding box, as `drawSprite` places it: centred on (x, y). A rotated
 * sprite gets the circle round its corners, so the box is never too small.
 */
export function spriteBounds(s: Sprite): { l: number; t: number; r: number; b: number } {
  const hw = s.rotation !== 0 ? Math.hypot(s.width, s.height) / 2 : s.width / 2;
  const hh = s.rotation !== 0 ? hw : s.height / 2;
  return { l: s.x - hw, t: s.y - hh, r: s.x + hw, b: s.y + hh };
}

/** The sprites whose box overlaps `rect`, keeping their order (the bake's sort order). */
export function spritesInRect(sprites: readonly Sprite[], rect: StaticRegion): Sprite[] {
  const rl = rect.originX;
  const rt = rect.originY;
  const rr = rect.originX + rect.width;
  const rb = rect.originY + rect.height;
  const out: Sprite[] = [];
  for (const s of sprites) {
    const b = spriteBounds(s);
    if (b.r > rl && b.l < rr && b.b > rt && b.t < rb) out.push(s);
  }
  return out;
}

/**
 * The file a painted image is cut into patches with (`patches.json`), written by the
 * `@tool/image-patches` asset step and read by `loadPatchedImage`.
 */
export interface PatchManifest {
  readonly version: 1;
  /** The whole image, in px. */
  readonly width: number;
  readonly height: number;
  readonly patchSize: number;
  /** One entry per patch, row-major (the order `slicePatches` returns). */
  readonly patches: readonly PatchManifestEntry[];
}

export interface PatchManifestEntry {
  /** Relative to the manifest. */
  readonly file: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** The patch rects of a `width × height` image cut at `size`, row-major, edge patches cropped. */
export function slicePatches(
  width: number,
  height: number,
  size: number,
): { col: number; row: number; x: number; y: number; w: number; h: number }[] {
  const grid = patchGrid({ originX: 0, originY: 0, width, height }, size);
  const out: { col: number; row: number; x: number; y: number; w: number; h: number }[] = [];
  for (let key = 0; key < grid.cols * grid.rows; key++) {
    const r = patchRect(grid, key);
    out.push({
      col: key % grid.cols,
      row: Math.floor(key / grid.cols),
      x: r.originX,
      y: r.originY,
      w: r.width,
      h: r.height,
    });
  }
  return out;
}

/** Check a parsed `patches.json`; throws naming what is wrong. */
export function validatePatchManifest(m: unknown): PatchManifest {
  const fail = (why: string): never => {
    throw new Error(`patches.json: ${why}`);
  };
  if (typeof m !== "object" || m === null) return fail("not an object");
  const o = m as Record<string, unknown>;
  if (o.version !== 1) fail(`unknown version ${String(o.version)}`);
  const num = (k: string): number => {
    const v = o[k];
    if (typeof v !== "number" || !Number.isInteger(v) || v <= 0) return fail(`${k} must be a positive integer`);
    return v;
  };
  const width = num("width");
  const height = num("height");
  const patchSize = num("patchSize");
  if (!Array.isArray(o.patches)) return fail("patches must be an array");
  const expected = slicePatches(width, height, patchSize);
  if (o.patches.length !== expected.length) {
    fail(`${o.patches.length} patches, but a ${width}×${height} image at ${patchSize} px has ${expected.length}`);
  }
  const patches = o.patches.map((p: unknown, i: number): PatchManifestEntry => {
    const e = expected[i]!;
    const q = (p ?? {}) as Record<string, unknown>;
    if (typeof q.file !== "string" || q.file === "") return fail(`patch ${i} has no file`);
    if (q.x !== e.x || q.y !== e.y || q.w !== e.w || q.h !== e.h) {
      fail(
        `patch ${i} is ${String(q.x)},${String(q.y)} ${String(q.w)}×${String(q.h)}, expected ${e.x},${e.y} ${e.w}×${e.h}`,
      );
    }
    return { file: q.file, x: e.x, y: e.y, w: e.w, h: e.h };
  });
  return { version: 1, width, height, patchSize, patches };
}

/**
 * Where a patched layer's images come from. A baked layer draws each patch from its sprites and
 * decorator on demand; a painted image hands back pre-cut files as they finish loading.
 */
export interface PatchSource {
  /** The image for patch `key`, covering world rect `rect`, or null while it is still loading. */
  produce(key: number, rect: StaticRegion): TexImageSource | null;
  /** The patch's texture was freed; drop anything held for it. */
  release?(key: number): void;
}

/** A painted image cut into patches: its manifest, and the source that loads each file. */
export interface PatchedImage extends PatchSource {
  readonly manifest: PatchManifest;
}

/** What the static layer holds right now (dev hooks and tests read it). */
export interface StaticLayerInfo {
  /** `single`: one texture. `patched`: a grid of patches, baked or loaded as they come into view. */
  readonly mode: "none" | "single" | "patched";
  /** The patch edge in px (0 unless patched). */
  readonly patchSize: number;
  readonly cols: number;
  readonly rows: number;
  /** Textures held now. */
  readonly live: number;
  /** The largest edge of any texture held now, in px. */
  readonly largest: number;
  /** Patches produced since the last bake (a re-bake of a freed patch counts again). */
  readonly produced: number;
}
