
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
      return new Float32Array(this.heap.f32(outPtr, count)); 
    } finally {
      this.heap.free(outPtr);
    }
  }
}

export async function createNoiseGeneratorFromBytes(
  bytes: BufferSource,
): Promise<NoiseGenerator> {
  const loaded = await loadWasmModule<NoiseExports>({ bytes });
  return new NoiseGenerator(loaded);
}

export async function createNoiseGeneratorFromUrl(url: string): Promise<NoiseGenerator> {
  const loaded = await fetchWasmModule<NoiseExports>(url);
  return new NoiseGenerator(loaded);
}
