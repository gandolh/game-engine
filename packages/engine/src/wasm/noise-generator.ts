// Typed wrapper around the `noise.wasm` module.

import { loadWasmModule, fetchWasmModule } from "./loader";
import type { LoadedWasm } from "./loader";
import { WasmHeap } from "./memory";

interface NoiseExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  alloc(size: number): number;
  free(ptr: number): void;
  fillNoise(
    outPtr: number,
    cols: number,
    rows: number,
    seed: number,
    amplitudeX1000: number,
  ): void;
}

export class NoiseGenerator {
  private readonly exports: NoiseExports;
  private readonly heap: WasmHeap;

  constructor(loaded: LoadedWasm<NoiseExports>) {
    this.exports = loaded.exports;
    this.heap = new WasmHeap(loaded.memory, {
      alloc: (n) => this.exports.alloc(n),
      free: (p) => this.exports.free(p),
    });
  }

  /**
   * Returns a Float32Array of `cols * rows` brightness multipliers (row-major).
   * Each value is in `[1 - amplitude, 1 + amplitude]`.
   *
   * The returned array is a copy — safe to use after the call returns.
   */
  fillNoise(cols: number, rows: number, seed: number, amplitude: number): Float32Array {
    const count = cols * rows;
    const outPtr = this.heap.alloc(count * 4);
    try {
      this.exports.fillNoise(
        outPtr,
        cols,
        rows,
        seed >>> 0,
        Math.round(amplitude * 1000),
      );
      // Copy out before freeing (memory.buffer may move after next alloc).
      return new Float32Array(this.heap.f32(outPtr, count));
    } finally {
      this.heap.free(outPtr);
    }
  }
}

/** Instantiate the noise generator from raw wasm bytes (Node/tests). */
export async function createNoiseGeneratorFromBytes(
  bytes: BufferSource,
): Promise<NoiseGenerator> {
  const loaded = await loadWasmModule<NoiseExports>({ bytes });
  return new NoiseGenerator(loaded);
}

/** Instantiate the noise generator by URL (browser; also works in Node 18+). */
export async function createNoiseGeneratorFromUrl(url: string): Promise<NoiseGenerator> {
  const loaded = await fetchWasmModule<NoiseExports>(url);
  return new NoiseGenerator(loaded);
}
