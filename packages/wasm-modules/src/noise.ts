// AssemblyScript module: hash-based per-tile brightness noise.
//
// Memory contract:
//   - Heap is managed by AssemblyScript's TLSF allocator (stub runtime).
//   - Host calls `alloc(size)` to reserve output scratch in wasm linear memory,
//     calls `fillNoise`, reads the f32 values, then `free`s.
//   - Output buffer receives `cols * rows` f32 brightness multipliers (row-major).
//   - Each value is in [1-amplitude, 1+amplitude] centered on 1.0.
//
// Matches the hash2 / tileBrightness logic in farm-valley/src/render/ground-noise.ts.

export function alloc(size: i32): usize {
  return heap.alloc(<usize>size);
}

export function free(ptr: usize): void {
  heap.free(ptr);
}

@inline
function hash2(x: i32, y: i32, seed: i32): f32 {
  let h: u32 = (<u32>seed ^ <u32>Math.imul(x, 374761393) ^ <u32>Math.imul(y, 668265263));
  h = <u32>Math.imul(<i32>(h ^ (h >>> 13)), 1274126177);
  h = h ^ (h >>> 16);
  return <f32>h / <f32>4294967296.0;
}

/**
 * Fill outPtr with `cols * rows` f32 brightness multipliers (row-major).
 *
 * @param outPtr          pointer to host-allocated f32 output buffer
 * @param cols            number of tile columns
 * @param rows            number of tile rows
 * @param seed            hash seed (determines the noise pattern)
 * @param amplitudeX1000  amplitude * 1000 as integer (e.g. 120 = 0.12)
 */
export function fillNoise(
  outPtr: usize,
  cols: i32,
  rows: i32,
  seed: i32,
  amplitudeX1000: i32,
): void {
  const amplitude: f32 = <f32>amplitudeX1000 / <f32>1000.0;
  for (let ty: i32 = 0; ty < rows; ty++) {
    for (let tx: i32 = 0; tx < cols; tx++) {
      const n: f32 = hash2(tx, ty, seed);
      const brightness: f32 = 1.0 + (n * 2.0 - 1.0) * amplitude;
      store<f32>(outPtr + <usize>((ty * cols + tx) << 2), brightness);
    }
  }
}
