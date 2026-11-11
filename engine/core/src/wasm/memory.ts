export interface WasmAllocator {
  alloc(size: number): number;
  free(ptr: number): void;
}

export class WasmHeap {
  readonly memory: WebAssembly.Memory;
  readonly allocator: WasmAllocator;

  constructor(memory: WebAssembly.Memory, allocator: WasmAllocator) {
    this.memory = memory;
    this.allocator = allocator;
  }

  u8(ptr: number, length: number): Uint8Array {
    return new Uint8Array(this.memory.buffer, ptr, length);
  }

  i32(ptr: number, length: number): Int32Array {
    return new Int32Array(this.memory.buffer, ptr, length);
  }

  f32(ptr: number, length: number): Float32Array {
    return new Float32Array(this.memory.buffer, ptr, length);
  }

  alloc(size: number): number {
    const ptr = this.allocator.alloc(size);
    if (ptr === 0) throw new Error(`wasm alloc(${size}) returned null pointer`);
    return ptr;
  }

  free(ptr: number): void {
    this.allocator.free(ptr);
  }
}
