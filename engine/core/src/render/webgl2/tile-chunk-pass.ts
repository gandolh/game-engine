// tile-chunk-pass.ts — the tile-chunk spike (corpus brief 21): the static layer drawn from the atlas as
// chunks of tiles, instead of one image baked on the CPU and uploaded.
//
// Tile engines (Godot's TileMap, Unity's Tilemap, Tiled renderers) build a static vertex buffer per chunk
// of tiles and draw the chunks in view from the tile atlas, so the ground costs the atlas plus a few
// kilobytes a chunk instead of an image the size of the world. Here a chunk is CHUNK_TILES × CHUNK_TILES
// tiles: one instance buffer, built once per bake, holding one 24-byte instance per quad (layout in
// ./shaders/tile-chunk.vert.glsl). A frame draws the chunks that touch the view, one instanced draw per
// chunk (per texture run, when a chunk's sprites span textures).
//
// What a CPU bake's decorator painted over the tiles comes in as `TileChunkDecor` and is drawn as shader
// terms, with no texture: a per-tile shade (multiply or screen), multiply bands along chosen tile edges,
// and hashed speckles. Tiles with an opaque ground sprite carry the shade and the bands on their sprites;
// the other tiles get one decoration quad, drawn after the chunk's sprites.
//
// Spike limits, by design: every sprite is assigned to the chunk and the tile under its centre, so a
// sprite that overlaps a neighbouring chunk draws in its own chunk's order, not the global sort; rotation
// must be whole quarter turns; sizes and atlas rects must be whole pixels. Farm's static sprites meet all
// three. As in the CPU bake (../raster2d.ts `drawSprite`), sprite alpha is ignored.

import type { GlContext } from "./gl-context";
import type { GlAtlasStore } from "./gl-atlas-store";
import { compileProgram, createVao, setupAttrib, uniformLocations } from "./program";
import type { VisibleRect } from "./static-layer-pass";
import type { Sprite } from "../renderer";
import type { ViewUniform } from "../view-uniform";
import type { LoadedAtlasImage } from "../../assets/loader";
import { compareSprite } from "../raster2d";
import { rgbOf } from "../palette";
import vertSrc from "./shaders/tile-chunk.vert.glsl?raw";
import fragSrc from "./shaders/tile-chunk.frag.glsl?raw";

/** Tiles along a chunk's side. */
export const CHUNK_TILES = 32;
/** Bytes per instance: centre (2 × f32), size (2 × u16), atlas rect (4 × u16), misc (4 × u8). */
export const INSTANCE_BYTES = 24;
/** The shade byte for "no shade": the shader reads (byte - 128) / 255. */
export const SHADE_NONE = 128;

const KIND_SPRITE = 0;
const KIND_DECOR = 1;
const U16_MAX = 0xffff;

/** One speckle class: the share of cells that get a speck, its alpha, and the two colours it picks from. */
export interface SpeckleClass {
  density: number;
  alpha: number;
  colors: readonly [string, string];
}

/** What a CPU bake's decorator painted over the tiles, per tile (row-major, `tilesX` wide). */
export interface TileChunkDecor {
  tilesX: number;
  tilesY: number;
  /** 1 where an opaque ground sprite covers the tile: its shade and bands ride on the tile's sprites. */
  ground: Uint8Array;
  /** Brightness minus 1: below 0 multiplies by `shadeDark`, above 0 screens by `shadeLight`, at its size. */
  shade: Float32Array;
  shadeDark: string;
  shadeLight: string;
  /** Edges that get multiply bands: 1 top, 2 right, 4 bottom, 8 left. Only on ground tiles. */
  edges: Uint8Array;
  edgeColor: string;
  edgeBandPx: number;
  /** Up to four band alphas, from the edge inwards. */
  edgeBandAlphas: readonly number[];
  /** 0 for none, else 1 + an index into `speckleClasses`. Only on tiles without ground. */
  speckle: Uint8Array;
  /** At most two classes. */
  speckleClasses: readonly SpeckleClass[];
  specklePx: number;
  speckleSeed: number;
  speckleColorSeed: number;
}

/** One instanced draw: a run of a chunk's instances that sample the same texture. */
export interface ChunkSegment {
  /** A sheet on the run's texture; null for a run of decoration quads only. */
  atlasId: string | null;
  texW: number;
  texH: number;
  first: number;
  count: number;
}

export interface PlannedChunk {
  col: number;
  row: number;
  /** Every instance of the chunk, `INSTANCE_BYTES` each, sprites in sort order then decoration quads. */
  data: Uint8Array;
  segments: ChunkSegment[];
  instances: number;
}

export interface ChunkGrid {
  chunkPx: number;
  cols: number;
  rows: number;
  /** How far any sprite reaches past its own chunk's cell, in world px. */
  overhang: number;
}

export interface ChunkPlan extends ChunkGrid {
  /** Row-major, `cols × rows`; null for a chunk with nothing in it. */
  chunks: (PlannedChunk | null)[];
  instances: number;
  decorInstances: number;
  bytes: number;
}

/** A rotation in whole quarter turns (0-3). Throws on any other angle: the spike draws grid-aligned tiles only. */
export function quarterTurns(rotation: number): number {
  const q = rotation / (Math.PI / 2);
  const k = Math.round(q);
  if (Math.abs(q - k) > 1e-6) {
    throw new RangeError(`tile chunks: rotation ${rotation} is not a whole quarter turn`);
  }
  return ((k % 4) + 4) % 4;
}

/** A shade (brightness minus 1) as the byte the shader reads back as (byte - 128) / 255. */
export function shadeByte(shade: number): number {
  return Math.max(0, Math.min(255, Math.round(SHADE_NONE + shade * 255)));
}

/**
 * The integer cut a 32-bit hash is compared with: `hash / 2^32 < density` holds exactly when
 * `hash < ceil(density · 2^32)`, and the product is exact in a double.
 */
export function speckleCut(density: number): number {
  return Math.min(0xffffffff, Math.max(0, Math.ceil(density * 4294967296)));
}

function u16(value: number, what: string): number {
  if (!Number.isInteger(value) || value < 0 || value > U16_MAX) {
    throw new RangeError(`tile chunks: ${what} ${value} is not a whole number from 0 to ${U16_MAX}`);
  }
  return value;
}

interface Instance {
  cx: number;
  cy: number;
  w: number;
  h: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  bits: number;
  shade: number;
  edges: number;
  speckle: number;
}

function writeInstance(view: DataView, index: number, i: Instance): void {
  const o = index * INSTANCE_BYTES;
  view.setFloat32(o, i.cx, true);
  view.setFloat32(o + 4, i.cy, true);
  view.setUint16(o + 8, i.w, true);
  view.setUint16(o + 10, i.h, true);
  view.setUint16(o + 12, i.x0, true);
  view.setUint16(o + 14, i.y0, true);
  view.setUint16(o + 16, i.x1, true);
  view.setUint16(o + 18, i.y1, true);
  view.setUint8(o + 20, i.bits);
  view.setUint8(o + 21, i.shade);
  view.setUint8(o + 22, i.edges);
  view.setUint8(o + 23, i.speckle);
}

/** The decoration quads a chunk needs: tiles without ground that carry a shade or speckles. */
function decorTiles(decor: TileChunkDecor, col: number, row: number): number[] {
  const out: number[] = [];
  const tx0 = col * CHUNK_TILES;
  const ty0 = row * CHUNK_TILES;
  const tx1 = Math.min(decor.tilesX, tx0 + CHUNK_TILES);
  const ty1 = Math.min(decor.tilesY, ty0 + CHUNK_TILES);
  for (let ty = ty0; ty < ty1; ty++) {
    for (let tx = tx0; tx < tx1; tx++) {
      const t = ty * decor.tilesX + tx;
      if (decor.ground[t] === 1) continue;
      if (shadeByte(decor.shade[t] ?? 0) === SHADE_NONE && (decor.speckle[t] ?? 0) === 0) continue;
      out.push(t);
    }
  }
  return out;
}

/**
 * Sorts the sprites as the CPU bake does (a stable `compareSprite`), assigns each to the chunk under its
 * centre, and packs every chunk's instances: its sprites in that order, then its decoration quads. Pure:
 * reads the atlases' frame rects and bitmaps, touches no GL.
 */
export function planTileChunks(
  sprites: readonly Sprite[],
  atlases: ReadonlyMap<string, LoadedAtlasImage>,
  worldWidth: number,
  worldHeight: number,
  tileSize: number,
  decor?: TileChunkDecor,
): ChunkPlan {
  const chunkPx = CHUNK_TILES * tileSize;
  const cols = Math.max(1, Math.ceil(worldWidth / chunkPx));
  const rows = Math.max(1, Math.ceil(worldHeight / chunkPx));
  const buckets: Sprite[][] = Array.from({ length: cols * rows }, () => []);
  let overhang = 0;
  for (const s of sprites.slice().sort(compareSprite)) {
    const col = Math.min(cols - 1, Math.max(0, Math.floor(s.x / chunkPx)));
    const row = Math.min(rows - 1, Math.max(0, Math.floor(s.y / chunkPx)));
    buckets[row * cols + col]?.push(s);
    const half = Math.max(s.width, s.height) / 2;
    overhang = Math.max(
      overhang,
      col * chunkPx - (s.x - half),
      s.x + half - (col + 1) * chunkPx,
      row * chunkPx - (s.y - half),
      s.y + half - (row + 1) * chunkPx,
    );
  }

  const chunks: (PlannedChunk | null)[] = [];
  let instances = 0;
  let decorInstances = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const bucket = buckets[row * cols + col] ?? [];
      const decorList = decor ? decorTiles(decor, col, row) : [];
      const count = bucket.length + decorList.length;
      if (count === 0) {
        chunks.push(null);
        continue;
      }
      const data = new Uint8Array(count * INSTANCE_BYTES);
      const view = new DataView(data.buffer);
      const segments: ChunkSegment[] = [];
      let bitmap: object | null = null;
      let n = 0;
      for (const s of bucket) {
        const atlas = atlases.get(s.atlasId);
        if (!atlas) throw new Error(`tile chunks: atlas sheet "${s.atlasId}" not loaded (frame "${s.frame}")`);
        const last = segments[segments.length - 1];
        if (last === undefined || atlas.bitmap !== bitmap) {
          bitmap = atlas.bitmap;
          segments.push({
            atlasId: s.atlasId,
            texW: atlas.manifest.width,
            texH: atlas.manifest.height,
            first: n,
            count: 0,
          });
        }
        const r = atlas.frameRect(s.frame);
        let shade = SHADE_NONE;
        let edges = 0;
        if (decor) {
          const t = Math.floor(s.y / tileSize) * decor.tilesX + Math.floor(s.x / tileSize);
          if (decor.ground[t] === 1) {
            shade = shadeByte(decor.shade[t] ?? 0);
            edges = decor.edges[t] ?? 0;
          }
        }
        writeInstance(view, n, {
          cx: s.x,
          cy: s.y,
          w: u16(s.width, "sprite width"),
          h: u16(s.height, "sprite height"),
          x0: u16(r.x, "atlas x"),
          y0: u16(r.y, "atlas y"),
          x1: u16(r.x + r.w, "atlas x"),
          y1: u16(r.y + r.h, "atlas y"),
          bits: quarterTurns(s.rotation) + (s.flipX ? 4 : 0) + KIND_SPRITE * 8,
          shade,
          edges,
          speckle: 0,
        });
        n += 1;
        const seg = segments[segments.length - 1];
        if (seg) seg.count += 1;
      }
      if (decor && decorList.length > 0) {
        let seg = segments[segments.length - 1];
        if (seg === undefined) {
          seg = { atlasId: null, texW: 1, texH: 1, first: n, count: 0 };
          segments.push(seg);
        }
        for (const t of decorList) {
          const tx = t % decor.tilesX;
          const ty = (t - tx) / decor.tilesX;
          writeInstance(view, n, {
            cx: (tx + 0.5) * tileSize,
            cy: (ty + 0.5) * tileSize,
            w: u16(tileSize, "tile size"),
            h: u16(tileSize, "tile size"),
            x0: 0,
            y0: 0,
            x1: 0,
            y1: 0,
            bits: KIND_DECOR * 8,
            shade: shadeByte(decor.shade[t] ?? 0),
            edges: 0,
            speckle: decor.speckle[t] ?? 0,
          });
          n += 1;
          seg.count += 1;
        }
        decorInstances += decorList.length;
      }
      instances += n;
      chunks.push({ col, row, data, segments, instances: n });
    }
  }
  return {
    chunkPx,
    cols,
    rows,
    overhang,
    chunks,
    instances,
    decorInstances,
    bytes: instances * INSTANCE_BYTES,
  };
}

export interface ChunkRange {
  c0: number;
  c1: number;
  r0: number;
  r1: number;
}

/** The chunks a visible world rect touches (inclusive), or null when it touches none. */
export function visibleChunkRange(grid: ChunkGrid, vis: VisibleRect): ChunkRange | null {
  if (vis.visR <= vis.visL || vis.visB <= vis.visT) return null;
  const p = grid.chunkPx;
  const o = grid.overhang;
  const c0 = Math.max(0, Math.floor((vis.visL - o) / p));
  const c1 = Math.min(grid.cols - 1, Math.ceil((vis.visR + o) / p) - 1);
  const r0 = Math.max(0, Math.floor((vis.visT - o) / p));
  const r1 = Math.min(grid.rows - 1, Math.ceil((vis.visB + o) / p) - 1);
  if (c1 < c0 || r1 < r0) return null;
  return { c0, c1, r0, r1 };
}

/** What the pass holds and what its last frame cost; the host reads it for the profile. */
export interface TileChunkStats {
  /** Chunks with anything in them. */
  chunks: number;
  instances: number;
  decorInstances: number;
  /** Instance data held on the GPU (the texture counters can't see buffers). */
  bufferBytes: number;
  /** CPU ms of the last build: the plan and the upload. */
  buildMs: number;
  lastChunks: number;
  lastDraws: number;
  lastInstances: number;
  /** CPU ms of the last frame's draw. */
  lastMs: number;
}

const UNIFORM_NAMES = [
  "u_view",
  "u_texSize",
  "u_tile",
  "u_tex",
  "u_shadeDark",
  "u_shadeLight",
  "u_edgeColor",
  "u_edgeBandPx",
  "u_edgeAlpha",
  "u_specklePx",
  "u_speckleSeed",
  "u_speckleColorSeed",
  "u_speckleCut",
  "u_speckleAlpha",
  "u_speckleA0",
  "u_speckleB0",
  "u_speckleA1",
  "u_speckleB1",
] as const;

interface LiveChunk {
  buffer: WebGLBuffer;
  vaos: WebGLVertexArrayObject[];
  segments: ChunkSegment[];
  instances: number;
}

interface Input {
  sprites: readonly Sprite[];
  atlases: ReadonlyMap<string, LoadedAtlasImage>;
  worldWidth: number;
  worldHeight: number;
  tileSize: number;
  decor: TileChunkDecor | undefined;
}

function rgb01(hex: string): [number, number, number] {
  const [r, g, b] = rgbOf(hex);
  return [r / 255, g / 255, b / 255];
}

/**
 * The static layer as tile chunks. `build` plans and uploads; `draw` draws the chunks in view in place of
 * the static layer's blit; `restore` rebuilds every GL object after a context restore from the retained
 * input. The store is read through a getter because the renderer makes a new one on restore.
 */
export class TileChunkPass {
  private readonly ctx: GlContext;
  private readonly store: () => GlAtlasStore;
  private program: WebGLProgram | null = null;
  private uniforms: Record<(typeof UNIFORM_NAMES)[number], WebGLUniformLocation | null> | null = null;
  private input: Input | null = null;
  private grid: ChunkGrid | null = null;
  private live: (LiveChunk | null)[] = [];

  readonly stats: TileChunkStats = {
    chunks: 0,
    instances: 0,
    decorInstances: 0,
    bufferBytes: 0,
    buildMs: 0,
    lastChunks: 0,
    lastDraws: 0,
    lastInstances: 0,
    lastMs: 0,
  };

  constructor(ctx: GlContext, store: () => GlAtlasStore) {
    this.ctx = ctx;
    this.store = store;
  }

  /** Whether a build is held (it draws once the context allows). */
  get built(): boolean {
    return this.input !== null;
  }

  build(
    sprites: readonly Sprite[],
    atlases: ReadonlyMap<string, LoadedAtlasImage>,
    worldWidth: number,
    worldHeight: number,
    tileSize: number,
    decor?: TileChunkDecor,
  ): void {
    this.clear();
    this.input = { sprites, atlases, worldWidth, worldHeight, tileSize, decor };
    if (this.ctx.isLost()) return;
    this.upload(this.input);
  }

  /** After a context restore: every GL object died with the old context, so rebuild from the input. */
  restore(): void {
    this.program = null;
    this.uniforms = null;
    this.live = [];
    this.grid = null;
    if (this.input) this.upload(this.input);
  }

  clear(): void {
    const { gl } = this.ctx;
    for (const lc of this.live) {
      if (!lc) continue;
      for (const vao of lc.vaos) gl.deleteVertexArray(vao);
      gl.deleteBuffer(lc.buffer);
    }
    this.live = [];
    this.grid = null;
    this.input = null;
    this.stats.chunks = 0;
    this.stats.instances = 0;
    this.stats.decorInstances = 0;
    this.stats.bufferBytes = 0;
  }

  private initProgram(input: Input): void {
    const { gl } = this.ctx;
    if (!this.program) {
      this.program = compileProgram(gl, vertSrc, fragSrc, "tile-chunk");
      this.uniforms = uniformLocations(gl, this.program, UNIFORM_NAMES);
    }
    const u = this.uniforms;
    if (!u) return;
    // Uniforms are program state: the decoration's are set once per build, not per frame.
    gl.useProgram(this.program);
    gl.uniform1f(u.u_tile, input.tileSize);
    const d = input.decor;
    if (!d) return;
    gl.uniform3f(u.u_shadeDark, ...rgb01(d.shadeDark));
    gl.uniform3f(u.u_shadeLight, ...rgb01(d.shadeLight));
    gl.uniform3f(u.u_edgeColor, ...rgb01(d.edgeColor));
    gl.uniform1f(u.u_edgeBandPx, d.edgeBandPx);
    const a = d.edgeBandAlphas;
    gl.uniform4f(u.u_edgeAlpha, a[0] ?? 0, a[1] ?? 0, a[2] ?? 0, a[3] ?? 0);
    gl.uniform1f(u.u_specklePx, d.specklePx);
    gl.uniform1ui(u.u_speckleSeed, d.speckleSeed >>> 0);
    gl.uniform1ui(u.u_speckleColorSeed, d.speckleColorSeed >>> 0);
    const s0 = d.speckleClasses[0];
    const s1 = d.speckleClasses[1];
    gl.uniform2ui(u.u_speckleCut, s0 ? speckleCut(s0.density) : 0, s1 ? speckleCut(s1.density) : 0);
    gl.uniform2f(u.u_speckleAlpha, s0?.alpha ?? 0, s1?.alpha ?? 0);
    if (s0) {
      gl.uniform3f(u.u_speckleA0, ...rgb01(s0.colors[0]));
      gl.uniform3f(u.u_speckleB0, ...rgb01(s0.colors[1]));
    }
    if (s1) {
      gl.uniform3f(u.u_speckleA1, ...rgb01(s1.colors[0]));
      gl.uniform3f(u.u_speckleB1, ...rgb01(s1.colors[1]));
    }
  }

  private upload(input: Input): void {
    const t0 = performance.now();
    const plan = planTileChunks(
      input.sprites,
      input.atlases,
      input.worldWidth,
      input.worldHeight,
      input.tileSize,
      input.decor,
    );
    this.initProgram(input);
    const { gl } = this.ctx;
    let chunks = 0;
    this.live = plan.chunks.map((pc) => {
      if (!pc) return null;
      chunks += 1;
      const buffer = gl.createBuffer();
      if (!buffer) throw new Error("webgl2: gl.createBuffer() returned null for a tile chunk");
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, pc.data, gl.STATIC_DRAW);
      // No base instance in WebGL2: each texture run gets a VAO whose attributes start at its first instance.
      const vaos = pc.segments.map((seg) =>
        createVao(gl, (g) => {
          g.bindBuffer(g.ARRAY_BUFFER, buffer);
          const base = seg.first * INSTANCE_BYTES;
          setupAttrib(g, { location: 0, size: 2, type: g.FLOAT, stride: INSTANCE_BYTES, offset: base, divisor: 1 });
          // Integer attributes: see the vertex shader's header for why not float ones.
          const intAttrib = (location: number, size: number, type: number, offset: number): void => {
            g.enableVertexAttribArray(location);
            g.vertexAttribIPointer(location, size, type, INSTANCE_BYTES, base + offset);
            g.vertexAttribDivisor(location, 1);
          };
          intAttrib(1, 2, g.UNSIGNED_SHORT, 8);
          intAttrib(2, 4, g.UNSIGNED_SHORT, 12);
          intAttrib(3, 4, g.UNSIGNED_BYTE, 20);
        }),
      );
      return { buffer, vaos, segments: pc.segments, instances: pc.instances };
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.grid = { chunkPx: plan.chunkPx, cols: plan.cols, rows: plan.rows, overhang: plan.overhang };
    this.stats.chunks = chunks;
    this.stats.instances = plan.instances;
    this.stats.decorInstances = plan.decorInstances;
    this.stats.bufferBytes = plan.bytes;
    this.stats.buildMs = performance.now() - t0;
  }

  draw(target: GlContext, view: ViewUniform, visRect: VisibleRect): void {
    const t0 = performance.now();
    let chunks = 0;
    let draws = 0;
    let instances = 0;
    const grid = this.grid;
    const u = this.uniforms;
    if (grid && u && this.program && !target.isLost()) {
      const range = visibleChunkRange(grid, visRect);
      if (range) {
        const gl = target.gl;
        const store = this.store();
        gl.useProgram(this.program);
        gl.uniform4f(u.u_view, view.scaleX, view.scaleY, view.offsetX, view.offsetY);
        gl.activeTexture(gl.TEXTURE0);
        if (u.u_tex) gl.uniform1i(u.u_tex, 0);
        // Premultiplied blend, as the static layer's blit draws.
        gl.enable(gl.BLEND);
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        for (let row = range.r0; row <= range.r1; row++) {
          for (let col = range.c0; col <= range.c1; col++) {
            const lc = this.live[row * grid.cols + col];
            if (!lc) continue;
            chunks += 1;
            instances += lc.instances;
            for (let i = 0; i < lc.segments.length; i++) {
              const seg = lc.segments[i];
              const vao = lc.vaos[i];
              if (seg === undefined || vao === undefined) continue;
              if (seg.atlasId !== null) {
                gl.bindTexture(gl.TEXTURE_2D, store.texture(seg.atlasId));
                gl.uniform2f(u.u_texSize, seg.texW, seg.texH);
              }
              gl.bindVertexArray(vao);
              gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, seg.count);
              draws += 1;
            }
          }
        }
        gl.bindVertexArray(null);
      }
    }
    this.stats.lastChunks = chunks;
    this.stats.lastDraws = draws;
    this.stats.lastInstances = instances;
    this.stats.lastMs = performance.now() - t0;
  }
}
