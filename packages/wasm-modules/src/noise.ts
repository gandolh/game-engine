// AssemblyScript: hash-based per-tile brightness noise. Host alloc→fillNoise→free.
// Output: cols*rows f32 brightness multipliers in [1-amplitude, 1+amplitude], row-major.
// Matches hash2/tileBrightness in farm-valley/src/render/ground-noise.ts.

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

// amplitudeX1000: amplitude scaled by 1000 (e.g. 120 = 0.12) to avoid floats in the signature.
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
