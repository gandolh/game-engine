

export function alloc(size: i32): usize {
  return heap.alloc(<usize>size);
}

export function free(ptr: usize): void {
  heap.free(ptr);
}

export function floodFill(
  gridPtr: usize,
  width: i32,
  height: i32,
  startX: i32,
  startY: i32,
  outPtr: usize,
  outCap: i32,
): i32 {
  if (width <= 0 || height <= 0) return 0;
  if (startX < 0 || startY < 0 || startX >= width || startY >= height) return 0;

  const total: i32 = width * height;
  const startIdx: i32 = startY * width + startX;

  if (load<u8>(gridPtr + <usize>startIdx) != 0) return 0;

  const queuePtr: usize = heap.alloc(<usize>(total << 2));
  const visitedPtr: usize = heap.alloc(<usize>total);

  for (let i: i32 = 0; i < total; i++) {
    store<u8>(visitedPtr + <usize>i, 0);
  }

  const maxOut: i32 = outCap >> 1; 
  let qHead: i32 = 0;
  let qTail: i32 = 0;
  let found: i32 = 0;

  store<i32>(queuePtr + (<usize>qTail << 2), startIdx);
  qTail += 1;
  store<u8>(visitedPtr + <usize>startIdx, 1);

  while (qHead < qTail) {
    const idx: i32 = load<i32>(queuePtr + (<usize>qHead << 2));
    qHead += 1;

    const cy: i32 = idx / width;
    const cx: i32 = idx - cy * width;

    if (found < maxOut) {
      const off: usize = outPtr + <usize>(found << 3); 
      store<i32>(off, cx);
      store<i32>(off + 4, cy);
    }
    found += 1;

    for (let n: i32 = 0; n < 4; n++) {
      let nx: i32 = cx;
      let ny: i32 = cy;
      if (n == 0) nx = cx - 1;
      else if (n == 1) nx = cx + 1;
      else if (n == 2) ny = cy - 1;
      else ny = cy + 1;

      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const nIdx: i32 = ny * width + nx;
      if (load<u8>(visitedPtr + <usize>nIdx) != 0) continue;
      if (load<u8>(gridPtr + <usize>nIdx) != 0) continue;

      store<u8>(visitedPtr + <usize>nIdx, 1);
      store<i32>(queuePtr + (<usize>qTail << 2), nIdx);
      qTail += 1;
    }
  }

  heap.free(queuePtr);
  heap.free(visitedPtr);

  return found < maxOut ? found : maxOut;
}
