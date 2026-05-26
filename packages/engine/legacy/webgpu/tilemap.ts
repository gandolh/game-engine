import type { GpuContext } from "./device";
import type { LoadedAtlas } from "../assets";
import type { Camera2D } from "./camera";
import { TILEMAP_WGSL } from "./tilemap-shader";

/**
 * Axis-aligned bounding box in world units.
 * Convention: [minX, minY] is inclusive, [maxX, maxY] is exclusive.
 */
export interface Aabb {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface TilemapOptions {
  /** GPU context. Required for rendering; the tile data API works without GPU work. */
  gpu: GpuContext;
  /** Loaded sprite atlas to source tile graphics from. */
  atlas: LoadedAtlas;
  /** Number of tiles per chunk side (chunks are chunkSize x chunkSize tiles). */
  chunkSize: number;
  /** World-space size of a single tile (assumed square). */
  tileSizePx: number;
  /** Number of independent tile layers (drawn in order; layer index becomes depth). */
  layers: number;
}

/** Per-tile-instance float layout matching `TileInstance` in the shader. */
const FLOATS_PER_TILE = 12;
const TILE_INSTANCE_BYTES = FLOATS_PER_TILE * 4;
const EMPTY_TILE = -1;

interface Chunk {
  readonly cx: number;
  readonly cy: number;
  /** GPU instance buffer, lazily allocated on first upload. */
  buffer: GPUBuffer | null;
  bindGroup: GPUBindGroup | null;
  /** CPU-side instance data, rebuilt on dirty re-upload. */
  cpuData: Float32Array | null;
  /** Capacity of `buffer` in number of tile instances. */
  capacity: number;
  /** Number of non-empty tile instances currently in this chunk. */
  count: number;
  /** Marked true when any contained tile changes. */
  dirty: boolean;
}

interface Layer {
  /** Map of "cx,cy" -> tile id array (length chunkSize*chunkSize, -1 = empty). */
  readonly chunkTiles: Map<string, Int32Array>;
  /** Map of "cx,cy" -> GPU/render bookkeeping. */
  readonly chunks: Map<string, Chunk>;
}

/**
 * Compute the world-space AABB of a chunk at chunk-coordinates (cx, cy).
 * Pure helper — exported for testability.
 */
export function computeChunkAabb(
  cx: number,
  cy: number,
  chunkSize: number,
  tileSizePx: number,
): Aabb {
  const span = chunkSize * tileSizePx;
  const minX = cx * span;
  const minY = cy * span;
  return { minX, minY, maxX: minX + span, maxY: minY + span };
}

/**
 * Compute the visible AABB of a 2D orthographic camera in world units.
 * Pure helper — exported for testability.
 */
export function computeCameraAabb(camera: Camera2D): Aabb {
  const halfW = camera.worldUnitsX / 2;
  const halfH = camera.worldUnitsY / 2;
  return {
    minX: camera.centerX - halfW,
    minY: camera.centerY - halfH,
    maxX: camera.centerX + halfW,
    maxY: camera.centerY + halfH,
  };
}

/**
 * Returns true when AABB `a` overlaps AABB `b`. Edge-touching counts as
 * not overlapping (max is exclusive).
 * Pure helper — exported for testability.
 */
export function aabbIntersects(a: Aabb, b: Aabb): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

/**
 * Returns true when chunk (cx, cy) is at least partially inside the camera
 * AABB. Convenience composition of `computeChunkAabb` + `aabbIntersects`.
 * Pure helper — exported for testability.
 */
export function isChunkVisible(
  cx: number,
  cy: number,
  chunkSize: number,
  tileSizePx: number,
  cameraAabb: Aabb,
): boolean {
  return aabbIntersects(computeChunkAabb(cx, cy, chunkSize, tileSizePx), cameraAabb);
}

function chunkKey(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

/** Floor division that handles negative coordinates correctly. */
function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

/** Modulo that always returns a non-negative result for positive divisor. */
function posMod(a: number, b: number): number {
  return ((a % b) + b) % b;
}

/**
 * Chunked tilemap renderer.
 *
 * Tile data API (`setTile`, `getTile`, `fill`) works without any GPU activity.
 * GPU resources (pipeline, sampler, per-chunk buffers) are created lazily on
 * first `draw` call so the same instance is friendly to test environments.
 */
export class Tilemap {
  readonly chunkSize: number;
  readonly tileSizePx: number;
  readonly layers: number;
  readonly atlas: LoadedAtlas;

  private readonly gpu: GpuContext;
  private readonly device: GPUDevice;
  private readonly layerData: Layer[];

  // String frame name <-> numeric id mapping. Numeric ids are stable for the
  // lifetime of this Tilemap and let us pack tile data into Int32Arrays.
  private readonly nameToId = new Map<string, number>();
  private readonly idToName: string[] = [];
  /** Cached uv rect for each numeric id (4 floats per id: u, v, w, h). */
  private uvCache = new Float32Array(0);

  // GPU resources, created on first draw.
  private pipeline: GPURenderPipeline | null = null;
  private bindGroupLayout: GPUBindGroupLayout | null = null;
  private cameraBuffer: GPUBuffer | null = null;
  private sampler: GPUSampler | null = null;

  constructor(opts: TilemapOptions) {
    if (opts.chunkSize <= 0 || !Number.isInteger(opts.chunkSize)) {
      throw new Error(`Tilemap: chunkSize must be a positive integer, got ${opts.chunkSize}`);
    }
    if (opts.tileSizePx <= 0) {
      throw new Error(`Tilemap: tileSizePx must be positive, got ${opts.tileSizePx}`);
    }
    if (opts.layers <= 0 || !Number.isInteger(opts.layers)) {
      throw new Error(`Tilemap: layers must be a positive integer, got ${opts.layers}`);
    }

    this.gpu = opts.gpu;
    this.device = opts.gpu.device;
    this.atlas = opts.atlas;
    this.chunkSize = opts.chunkSize;
    this.tileSizePx = opts.tileSizePx;
    this.layers = opts.layers;

    this.layerData = [];
    for (let i = 0; i < opts.layers; i++) {
      this.layerData.push({
        chunkTiles: new Map(),
        chunks: new Map(),
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Tile data API
  // ---------------------------------------------------------------------------

  /**
   * Set a tile at world tile coordinates (tileX, tileY) on the given layer.
   * Passing `null` clears the tile. Marks the containing chunk dirty.
   */
  setTile(layer: number, tileX: number, tileY: number, frame: string | null): void {
    this.assertLayer(layer);
    const id = frame === null ? EMPTY_TILE : this.internFrame(frame);
    const cx = floorDiv(tileX, this.chunkSize);
    const cy = floorDiv(tileY, this.chunkSize);
    const localX = posMod(tileX, this.chunkSize);
    const localY = posMod(tileY, this.chunkSize);
    const key = chunkKey(cx, cy);

    const l = this.layerData[layer]!;
    let tiles = l.chunkTiles.get(key);
    if (!tiles) {
      // Allocate-on-write. Skip if we're clearing an already-empty tile.
      if (id === EMPTY_TILE) return;
      tiles = new Int32Array(this.chunkSize * this.chunkSize).fill(EMPTY_TILE);
      l.chunkTiles.set(key, tiles);
    }

    const idx = localY * this.chunkSize + localX;
    if (tiles[idx] === id) return;
    tiles[idx] = id;

    this.markDirty(layer, cx, cy);
  }

  /** Read the frame name at the given tile coordinate, or `null` if empty/unset. */
  getTile(layer: number, tileX: number, tileY: number): string | null {
    this.assertLayer(layer);
    const cx = floorDiv(tileX, this.chunkSize);
    const cy = floorDiv(tileY, this.chunkSize);
    const localX = posMod(tileX, this.chunkSize);
    const localY = posMod(tileY, this.chunkSize);
    const tiles = this.layerData[layer]!.chunkTiles.get(chunkKey(cx, cy));
    if (!tiles) return null;
    const id = tiles[localY * this.chunkSize + localX];
    if (id === undefined || id === EMPTY_TILE) return null;
    return this.idToName[id] ?? null;
  }

  /**
   * Bulk-fill the rectangle [x0, y0] - [x1, y1] (inclusive) with `frame`.
   * Marks every affected chunk dirty exactly once.
   */
  fill(
    layer: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    frame: string | null,
  ): void {
    this.assertLayer(layer);
    const loX = Math.min(x0, x1);
    const hiX = Math.max(x0, x1);
    const loY = Math.min(y0, y1);
    const hiY = Math.max(y0, y1);
    const id = frame === null ? EMPTY_TILE : this.internFrame(frame);
    const cs = this.chunkSize;

    const minCx = floorDiv(loX, cs);
    const maxCx = floorDiv(hiX, cs);
    const minCy = floorDiv(loY, cs);
    const maxCy = floorDiv(hiY, cs);

    const l = this.layerData[layer]!;
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const key = chunkKey(cx, cy);
        let tiles = l.chunkTiles.get(key);
        if (!tiles) {
          if (id === EMPTY_TILE) continue;
          tiles = new Int32Array(cs * cs).fill(EMPTY_TILE);
          l.chunkTiles.set(key, tiles);
        }
        // Intersect rect with this chunk's tile range.
        const chunkMinX = cx * cs;
        const chunkMinY = cy * cs;
        const startX = Math.max(loX, chunkMinX) - chunkMinX;
        const endX = Math.min(hiX, chunkMinX + cs - 1) - chunkMinX;
        const startY = Math.max(loY, chunkMinY) - chunkMinY;
        const endY = Math.min(hiY, chunkMinY + cs - 1) - chunkMinY;

        let changed = false;
        for (let ly = startY; ly <= endY; ly++) {
          const row = ly * cs;
          for (let lx = startX; lx <= endX; lx++) {
            const idx = row + lx;
            if (tiles[idx] !== id) {
              tiles[idx] = id;
              changed = true;
            }
          }
        }
        if (changed) this.markDirty(layer, cx, cy);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Introspection (useful for tests / tools)
  // ---------------------------------------------------------------------------

  /** Returns the chunk coordinate keys ("cx,cy") that are currently dirty on `layer`. */
  getDirtyChunks(layer: number): string[] {
    this.assertLayer(layer);
    const out: string[] = [];
    for (const c of this.layerData[layer]!.chunks.values()) {
      if (c.dirty) out.push(chunkKey(c.cx, c.cy));
    }
    return out;
  }

  /** Returns the chunk coordinate keys allocated on `layer` (dirty or not). */
  getAllocatedChunks(layer: number): string[] {
    this.assertLayer(layer);
    return [...this.layerData[layer]!.chunkTiles.keys()];
  }

  /**
   * Compute the list of chunk coordinate keys on `layer` that are within the
   * camera's visible AABB. Pure with respect to GPU state; the result depends
   * only on currently-allocated chunks and `camera`.
   */
  visibleChunks(layer: number, camera: Camera2D): string[] {
    this.assertLayer(layer);
    const camAabb = computeCameraAabb(camera);
    const out: string[] = [];
    for (const key of this.layerData[layer]!.chunkTiles.keys()) {
      const [cxS, cyS] = key.split(",");
      const cx = Number(cxS);
      const cy = Number(cyS);
      if (isChunkVisible(cx, cy, this.chunkSize, this.tileSizePx, camAabb)) {
        out.push(key);
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  /**
   * Issue one draw call per visible non-empty chunk across all layers, in
   * layer order. Lazily creates GPU resources on first call.
   */
  draw(pass: GPURenderPassEncoder, camera: Camera2D): void {
    this.ensureGpuResources();
    const pipeline = this.pipeline!;
    const cameraBuffer = this.cameraBuffer!;

    // Upload camera view-projection.
    this.device.queue.writeBuffer(cameraBuffer, 0, camera.viewProjection());

    const camAabb = computeCameraAabb(camera);
    pass.setPipeline(pipeline);

    for (let layer = 0; layer < this.layers; layer++) {
      const l = this.layerData[layer]!;
      for (const [key, tiles] of l.chunkTiles) {
        const [cxS, cyS] = key.split(",");
        const cx = Number(cxS);
        const cy = Number(cyS);
        if (!isChunkVisible(cx, cy, this.chunkSize, this.tileSizePx, camAabb)) continue;

        const chunk = this.ensureChunkRecord(layer, cx, cy);
        if (chunk.dirty || chunk.buffer === null) {
          this.rebuildChunkCpuData(chunk, tiles, layer);
          this.uploadChunk(chunk);
        }
        if (chunk.count === 0 || !chunk.bindGroup) continue;
        pass.setBindGroup(0, chunk.bindGroup);
        pass.draw(6, chunk.count, 0, 0);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private assertLayer(layer: number): void {
    if (layer < 0 || layer >= this.layers || !Number.isInteger(layer)) {
      throw new Error(`Tilemap: invalid layer ${layer} (have ${this.layers} layers)`);
    }
  }

  private internFrame(name: string): number {
    const existing = this.nameToId.get(name);
    if (existing !== undefined) return existing;
    // Validate by asking the atlas for the uv (throws if unknown).
    const uv = this.atlas.frameUv(name);
    const id = this.idToName.length;
    this.nameToId.set(name, id);
    this.idToName.push(name);
    // Grow the uv cache to fit the new id.
    const next = new Float32Array((id + 1) * 4);
    next.set(this.uvCache);
    next[id * 4 + 0] = uv.u;
    next[id * 4 + 1] = uv.v;
    next[id * 4 + 2] = uv.w;
    next[id * 4 + 3] = uv.h;
    this.uvCache = next;
    return id;
  }

  private markDirty(layer: number, cx: number, cy: number): void {
    const chunk = this.ensureChunkRecord(layer, cx, cy);
    chunk.dirty = true;
  }

  private ensureChunkRecord(layer: number, cx: number, cy: number): Chunk {
    const key = chunkKey(cx, cy);
    const l = this.layerData[layer]!;
    let chunk = l.chunks.get(key);
    if (!chunk) {
      chunk = {
        cx,
        cy,
        buffer: null,
        bindGroup: null,
        cpuData: null,
        capacity: 0,
        count: 0,
        dirty: true,
      };
      l.chunks.set(key, chunk);
    }
    return chunk;
  }

  private rebuildChunkCpuData(chunk: Chunk, tiles: Int32Array, layer: number): void {
    const cs = this.chunkSize;
    const tileSize = this.tileSizePx;
    const baseX = chunk.cx * cs * tileSize;
    const baseY = chunk.cy * cs * tileSize;

    // Count non-empty tiles to size the buffer exactly.
    let count = 0;
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i] !== EMPTY_TILE) count++;
    }

    if (count === 0) {
      chunk.cpuData = null;
      chunk.count = 0;
      return;
    }

    let cpu = chunk.cpuData;
    const needed = count * FLOATS_PER_TILE;
    if (!cpu || cpu.length < needed) {
      cpu = new Float32Array(needed);
    }

    let o = 0;
    const uv = this.uvCache;
    for (let ly = 0; ly < cs; ly++) {
      for (let lx = 0; lx < cs; lx++) {
        const idx = ly * cs + lx;
        const id = tiles[idx]!;
        if (id === EMPTY_TILE) continue;
        const uvBase = id * 4;
        // posSize.xy = tile world origin
        cpu[o + 0] = baseX + lx * tileSize;
        cpu[o + 1] = baseY + ly * tileSize;
        // posSize.zw = tile world size
        cpu[o + 2] = tileSize;
        cpu[o + 3] = tileSize;
        // uvRect
        cpu[o + 4] = uv[uvBase + 0]!;
        cpu[o + 5] = uv[uvBase + 1]!;
        cpu[o + 6] = uv[uvBase + 2]!;
        cpu[o + 7] = uv[uvBase + 3]!;
        // depth: use layer index as integer depth (matches sprite convention)
        cpu[o + 8] = layer;
        cpu[o + 9] = 0;
        cpu[o + 10] = 0;
        cpu[o + 11] = 0;
        o += FLOATS_PER_TILE;
      }
    }
    chunk.cpuData = cpu;
    chunk.count = count;
  }

  private uploadChunk(chunk: Chunk): void {
    if (chunk.count === 0 || !chunk.cpuData) {
      chunk.dirty = false;
      return;
    }
    const needBytes = chunk.count * TILE_INSTANCE_BYTES;
    if (!chunk.buffer || chunk.capacity < chunk.count) {
      if (chunk.buffer) chunk.buffer.destroy();
      // Round up capacity to amortize re-allocation.
      const newCap = Math.max(chunk.count, chunk.capacity > 0 ? chunk.capacity * 2 : 64);
      chunk.buffer = this.device.createBuffer({
        size: newCap * TILE_INSTANCE_BYTES,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      chunk.capacity = newCap;
      chunk.bindGroup = this.createChunkBindGroup(chunk.buffer);
    }
    this.device.queue.writeBuffer(
      chunk.buffer,
      0,
      chunk.cpuData.buffer,
      chunk.cpuData.byteOffset,
      needBytes,
    );
    chunk.dirty = false;
  }

  private createChunkBindGroup(buffer: GPUBuffer): GPUBindGroup {
    const layout = this.bindGroupLayout!;
    return this.device.createBindGroup({
      layout,
      entries: [
        { binding: 0, resource: { buffer: this.cameraBuffer! } },
        { binding: 1, resource: this.atlas.view },
        { binding: 2, resource: this.sampler! },
        { binding: 3, resource: { buffer } },
      ],
    });
  }

  private ensureGpuResources(): void {
    if (this.pipeline) return;

    this.cameraBuffer = this.device.createBuffer({
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.sampler = this.device.createSampler({
      magFilter: "nearest",
      minFilter: "nearest",
      mipmapFilter: "nearest",
    });
    this.bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "non-filtering" } },
        { binding: 3, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
      ],
    });
    const module = this.device.createShaderModule({ code: TILEMAP_WGSL });
    this.pipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] }),
      vertex: { module, entryPoint: "vs_main" },
      fragment: {
        module,
        entryPoint: "fs_main",
        targets: [
          {
            format: this.gpu.format,
            blend: {
              color: {
                srcFactor: "src-alpha",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
              alpha: {
                srcFactor: "one",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
            },
          },
        ],
      },
      primitive: { topology: "triangle-list" },
    });
  }
}
