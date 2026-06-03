// Typed wrapper around the `floodfill.wasm` module.

import { loadWasmModule, fetchWasmModule } from "./loader";
import type { LoadedWasm } from "./loader";
import { WasmHeap } from "./memory";
import type { PathfinderGrid } from "./pathfinder";

interface FloodFillExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  alloc(size: number): number;
  free(ptr: number): void;
  floodFill(
    gridPtr: number,
    width: number,
    height: number,
    startX: number,
    startY: number,
    outPtr: number,
    outCap: number,
  ): number;
}

export class FloodFiller {
  private readonly exports: FloodFillExports;
  private readonly heap: WasmHeap;

  /** Maximum reachable tiles any single `floodFill` call can return. */
  readonly maxTiles: number;

  constructor(loaded: LoadedWasm<FloodFillExports>, opts?: { maxTiles?: number }) {
    this.exports = loaded.exports;
    this.heap = new WasmHeap(loaded.memory, {
      alloc: (n) => this.exports.alloc(n),
      free: (p) => this.exports.free(p),
    });
    this.maxTiles = opts?.maxTiles ?? 65536;
  }

  /**
   * BFS flood-fill from `start` across all walkable tiles reachable on `grid`.
   * Returns the (x, y) coordinates of every reachable tile, including the start.
   * The result is capped at `maxTiles` (or the explicit `maxTiles` override).
   */
  floodFill(
    grid: PathfinderGrid,
    start: { x: number; y: number },
    maxTiles?: number,
  ): Array<{ x: number; y: number }> {
    const { width, height, cells } = grid;
    if (cells.length !== width * height) {
      throw new Error(
        `FloodFiller.floodFill: cells.length (${cells.length}) != width*height (${width * height})`,
      );
    }

    const cap = maxTiles ?? this.maxTiles;
    const gridPtr = this.heap.alloc(cells.length);
    // outCap in i32s: cap tile pairs * 2 i32s each.
    const outCap = cap * 2;
    const outPtr = this.heap.alloc(outCap * 4);
    try {
      this.heap.u8(gridPtr, cells.length).set(cells);
      const count = this.exports.floodFill(
        gridPtr,
        width,
        height,
        start.x,
        start.y,
        outPtr,
        outCap,
      );
      if (count <= 0) return [];
      const view = this.heap.i32(outPtr, count * 2);
      const out: Array<{ x: number; y: number }> = new Array(count);
      for (let i = 0; i < count; i++) {
        out[i] = { x: view[i * 2]!, y: view[i * 2 + 1]! };
      }
      return out;
    } finally {
      this.heap.free(gridPtr);
      this.heap.free(outPtr);
    }
  }
}

/** Instantiate the flood filler from raw wasm bytes (Node/tests). */
export async function createFloodFillerFromBytes(
  bytes: BufferSource,
  opts?: { maxTiles?: number },
): Promise<FloodFiller> {
  const loaded = await loadWasmModule<FloodFillExports>({ bytes });
  return new FloodFiller(loaded, opts);
}

/** Instantiate the flood filler by URL (browser; also works in Node 18+). */
export async function createFloodFillerFromUrl(
  url: string,
  opts?: { maxTiles?: number },
): Promise<FloodFiller> {
  const loaded = await fetchWasmModule<FloodFillExports>(url);
  return new FloodFiller(loaded, opts);
}
