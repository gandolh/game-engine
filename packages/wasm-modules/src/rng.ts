

export function alloc(size: i32): usize {
  return heap.alloc(<usize>size);
}

export function free(ptr: usize): void {
  heap.free(ptr);
}

export function fillRandom(
  outPtr: usize,
  count: i32,
  state: i32,
): i32 {
  let s: u32 = <u32>state;
  for (let i: i32 = 0; i < count; i++) {
    s = (s + <u32>0x6d2b79f5) & 0xffffffff;
    let t: u32 = s;
    t = <u32>Math.imul(<i32>(t ^ (t >>> 15)), <i32>(t | 1));
    t ^= t + <u32>Math.imul(<i32>(t ^ (t >>> 7)), <i32>(t | 61));
    const result: u32 = (t ^ (t >>> 14));
    const f: f32 = <f32>result / <f32>4294967296.0;
    store<f32>(outPtr + <usize>(i << 2), f);
  }
  return <i32>s;
}
