// Typed wrapper around the `rng.wasm` module.

import { loadWasmModule, fetchWasmModule } from "./loader";
import type { LoadedWasm } from "./loader";
import { WasmHeap } from "./memory";

interface RngExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  alloc(size: number): number;
  free(ptr: number): void;
  fillRandom(outPtr: number, count: number, state: number): number;
}

export class BatchRng {
  private readonly exports: RngExports;
  private readonly heap: WasmHeap;

  constructor(loaded: LoadedWasm<RngExports>) {
    this.exports = loaded.exports;
    this.heap = new WasmHeap(loaded.memory, {
      alloc: (n) => this.exports.alloc(n),
      free: (p) => this.exports.free(p),
    });
  }

  /**
   * Fill a Float32Array with `count` random values in [0, 1) using Mulberry32.
   * Returns the values and the updated RNG state for continuity across calls.
   */
  fillRandom(count: number, state: number): { values: Float32Array; nextState: number } {
    const outPtr = this.heap.alloc(count * 4);
    try {
      const nextState = this.exports.fillRandom(outPtr, count, state >>> 0);
      // Copy out before freeing.
      const values = new Float32Array(this.heap.f32(outPtr, count));
      return { values, nextState };
    } finally {
      this.heap.free(outPtr);
    }
  }
}

/** Instantiate the batch RNG from raw wasm bytes (Node/tests). */
export async function createBatchRngFromBytes(bytes: BufferSource): Promise<BatchRng> {
  const loaded = await loadWasmModule<RngExports>({ bytes });
  return new BatchRng(loaded);
}

/** Instantiate the batch RNG by URL (browser; also works in Node 18+). */
export async function createBatchRngFromUrl(url: string): Promise<BatchRng> {
  const loaded = await fetchWasmModule<RngExports>(url);
  return new BatchRng(loaded);
}
