// Typed wrapper around the `pathfinding.wasm` module.

import { loadWasmModule, fetchWasmModule } from "./loader";
import type { LoadedWasm } from "./loader";
import { WasmHeap } from "./memory";

interface PathfindingExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  alloc(size: number): number;
  free(ptr: number): void;
  findPath(
    gridPtr: number,
    width: number,
    height: number,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    outPtr: number,
    outCap: number,
  ): number;
}

export interface PathPoint {
  x: number;
  y: number;
}

export interface PathfinderGrid {
  /** Row-major u8: 0 = walkable, anything else = blocked. */
  cells: Uint8Array;
  width: number;
  height: number;
}

export class Pathfinder {
  private readonly exports: PathfindingExports;
  private readonly heap: WasmHeap;

  /** Maximum waypoints any single `findPath` call can return. */
  readonly maxWaypoints: number;

  constructor(loaded: LoadedWasm<PathfindingExports>, opts?: { maxWaypoints?: number }) {
    this.exports = loaded.exports;
    this.heap = new WasmHeap(loaded.memory, {
      alloc: (n) => this.exports.alloc(n),
      free: (p) => this.exports.free(p),
    });
    this.maxWaypoints = opts?.maxWaypoints ?? 4096;
  }

  /**
   * Find a 4-connected shortest path through a grid.
   * Returns an empty array when no path exists or inputs are out of bounds.
   */
  findPath(grid: PathfinderGrid, start: PathPoint, end: PathPoint): PathPoint[] {
    const { width, height, cells } = grid;
    if (cells.length !== width * height) {
      throw new Error(
        `Pathfinder.findPath: cells.length (${cells.length}) != width*height (${width * height})`,
      );
    }

    const gridPtr = this.heap.alloc(cells.length);
    const outCap = this.maxWaypoints * 2;
    const outPtr = this.heap.alloc(outCap * 4);
    try {
      this.heap.u8(gridPtr, cells.length).set(cells);
      const length = this.exports.findPath(
        gridPtr,
        width,
        height,
        start.x,
        start.y,
        end.x,
        end.y,
        outPtr,
        outCap,
      );
      if (length <= 0) return [];
      const view = this.heap.i32(outPtr, length * 2);
      const out: PathPoint[] = new Array(length);
      for (let i = 0; i < length; i++) {
        out[i] = { x: view[i * 2]!, y: view[i * 2 + 1]! };
      }
      return out;
    } finally {
      this.heap.free(gridPtr);
      this.heap.free(outPtr);
    }
  }
}

/** Instantiate the pathfinder from raw wasm bytes (Node/tests). */
export async function createPathfinderFromBytes(
  bytes: BufferSource,
  opts?: { maxWaypoints?: number },
): Promise<Pathfinder> {
  const loaded = await loadWasmModule<PathfindingExports>({ bytes });
  return new Pathfinder(loaded, opts);
}

/** Instantiate the pathfinder by URL (browser; also works in Node 18+). */
export async function createPathfinderFromUrl(
  url: string,
  opts?: { maxWaypoints?: number },
): Promise<Pathfinder> {
  const loaded = await fetchWasmModule<PathfindingExports>(url);
  return new Pathfinder(loaded, opts);
}
