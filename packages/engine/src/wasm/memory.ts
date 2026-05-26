// Thin helpers around a wasm module's linear memory. AssemblyScript modules
// resize memory dynamically via the TLSF allocator, which means any typed
// array view created against `memory.buffer` is invalidated after a grow.
// `WasmHeap` re-fetches the buffer each time you ask for a view.

export interface WasmAllocator {
  alloc(size: number): number;
  free(ptr: number): void;
}

export class WasmHeap {
  constructor(
    readonly memory: WebAssembly.Memory,
    readonly allocator: WasmAllocator,
  ) {}

  u8(ptr: number, length: number): Uint8Array {
    return new Uint8Array(this.memory.buffer, ptr, length);
  }

  i32(ptr: number, length: number): Int32Array {
    return new Int32Array(this.memory.buffer, ptr, length);
  }

  f32(ptr: number, length: number): Float32Array {
    return new Float32Array(this.memory.buffer, ptr, length);
  }

  /** Allocate `size` bytes inside the wasm heap; throws if the allocator returns 0. */
  alloc(size: number): number {
    const ptr = this.allocator.alloc(size);
    if (ptr === 0) throw new Error(`wasm alloc(${size}) returned null pointer`);
    return ptr;
  }

  free(ptr: number): void {
    this.allocator.free(ptr);
  }
}
