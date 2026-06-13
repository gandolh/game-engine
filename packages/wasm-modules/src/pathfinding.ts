

export function alloc(size: i32): usize {
  return heap.alloc(<usize>size);
}

export function free(ptr: usize): void {
  heap.free(ptr);
}

@inline
function manhattan(ax: i32, ay: i32, bx: i32, by: i32): i32 {
  const dx = ax - bx;
  const dy = ay - by;
  return (dx < 0 ? -dx : dx) + (dy < 0 ? -dy : dy);
}

let scratchGScore: usize = 0;  
let scratchParent: usize = 0;  
let scratchClosed: usize = 0;  
let scratchHeap:   usize = 0;  
let scratchCap:    i32   = 0;  

@inline
function ensureScratch(total: i32): void {
  if (total <= scratchCap) return;

  if (scratchCap > 0) {
    heap.free(scratchGScore);
    heap.free(scratchParent);
    heap.free(scratchClosed);
    heap.free(scratchHeap);
  }

  scratchGScore = heap.alloc(<usize>(total << 2));         
  scratchParent = heap.alloc(<usize>(total << 2));
  scratchClosed = heap.alloc(<usize>total);                
  scratchHeap   = heap.alloc(<usize>((total + 1) << 3));  
  scratchCap    = total;
}

export function findPath(
  gridPtr: usize,
  width: i32,
  height: i32,
  startX: i32,
  startY: i32,
  endX: i32,
  endY: i32,
  outPtr: usize,
  outCap: i32,
): i32 {
  if (width <= 0 || height <= 0) return 0;
  if (startX < 0 || startY < 0 || endX < 0 || endY < 0) return 0;
  if (startX >= width || startY >= height) return 0;
  if (endX >= width || endY >= height) return 0;

  const total: i32 = width * height;
  const startIdx: i32 = startY * width + startX;
  const endIdx: i32 = endY * width + endX;

  if (load<u8>(gridPtr + <usize>startIdx) != 0) return 0;
  if (load<u8>(gridPtr + <usize>endIdx) != 0) return 0;

  ensureScratch(total);

  memory.fill(scratchClosed, 0, <usize>total);
  for (let i: i32 = 0; i < total; i++) {
    store<i32>(scratchGScore + (<usize>i << 2), i32.MAX_VALUE);
    store<i32>(scratchParent + (<usize>i << 2), -1);
  }

  let heapLen: i32 = 0;

  store<i32>(scratchGScore + (<usize>startIdx << 2), 0);
  heapLen = push(scratchHeap, heapLen, manhattan(startX, startY, endX, endY), startIdx);

  let found: bool = false;

  while (heapLen > 0) {
    const topIdx: i32 = load<i32>(scratchHeap + 4);
    const topF: i32 = load<i32>(scratchHeap);
    heapLen = popMin(scratchHeap, heapLen);

    if (load<u8>(scratchClosed + <usize>topIdx) != 0) continue;
    store<u8>(scratchClosed + <usize>topIdx, 1);

    if (topIdx == endIdx) {
      found = true;
      break;
    }

    let _unused: i32 = topF;
    _unused = _unused;

    const cy: i32 = topIdx / width;
    const cx: i32 = topIdx - cy * width;
    const cg: i32 = load<i32>(scratchGScore + (<usize>topIdx << 2));

    for (let n: i32 = 0; n < 4; n++) {
      let nx: i32 = cx;
      let ny: i32 = cy;
      if (n == 0) nx = cx - 1;
      else if (n == 1) nx = cx + 1;
      else if (n == 2) ny = cy - 1;
      else ny = cy + 1;

      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const nIdx: i32 = ny * width + nx;
      if (load<u8>(gridPtr + <usize>nIdx) != 0) continue;
      if (load<u8>(scratchClosed + <usize>nIdx) != 0) continue;

      const tentative: i32 = cg + 1;
      const existing: i32 = load<i32>(scratchGScore + (<usize>nIdx << 2));
      if (tentative < existing) {
        store<i32>(scratchGScore + (<usize>nIdx << 2), tentative);
        store<i32>(scratchParent + (<usize>nIdx << 2), topIdx);
        const f: i32 = tentative + manhattan(nx, ny, endX, endY);
        heapLen = push(scratchHeap, heapLen, f, nIdx);
      }
    }
  }

  let written: i32 = 0;
  if (found) {

    let trace: i32 = endIdx;
    let length: i32 = 0;
    while (trace != -1) {
      length += 1;
      if (trace == startIdx) break;
      trace = load<i32>(scratchParent + (<usize>trace << 2));
    }
    if (length * 2 <= outCap) {
      trace = endIdx;
      let writeIdx: i32 = length - 1;
      while (writeIdx >= 0) {
        const ty: i32 = trace / width;
        const tx: i32 = trace - ty * width;
        const off: usize = outPtr + <usize>(writeIdx * 8);
        store<i32>(off, tx);
        store<i32>(off + 4, ty);
        if (trace == startIdx) break;
        trace = load<i32>(scratchParent + (<usize>trace << 2));
        writeIdx -= 1;
      }
      written = length;
    }
  }

  return written;
}

@inline
function push(heapPtr: usize, heapLen: i32, f: i32, idx: i32): i32 {
  let i: i32 = heapLen;
  store<i32>(heapPtr + (<usize>i << 3), f);
  store<i32>(heapPtr + (<usize>i << 3) + 4, idx);
  while (i > 0) {
    const parentIdx: i32 = (i - 1) >> 1;
    const pf: i32 = load<i32>(heapPtr + (<usize>parentIdx << 3));
    if (pf <= f) break;
    const pIdx: i32 = load<i32>(heapPtr + (<usize>parentIdx << 3) + 4);
    store<i32>(heapPtr + (<usize>i << 3), pf);
    store<i32>(heapPtr + (<usize>i << 3) + 4, pIdx);
    store<i32>(heapPtr + (<usize>parentIdx << 3), f);
    store<i32>(heapPtr + (<usize>parentIdx << 3) + 4, idx);
    i = parentIdx;
  }
  return heapLen + 1;
}

@inline
function popMin(heapPtr: usize, heapLen: i32): i32 {
  const newLen: i32 = heapLen - 1;
  if (newLen <= 0) return newLen;
  const lastF: i32 = load<i32>(heapPtr + (<usize>newLen << 3));
  const lastIdx: i32 = load<i32>(heapPtr + (<usize>newLen << 3) + 4);
  store<i32>(heapPtr, lastF);
  store<i32>(heapPtr + 4, lastIdx);
  let i: i32 = 0;
  while (true) {
    const l: i32 = (i << 1) + 1;
    const r: i32 = l + 1;
    let smallest: i32 = i;
    let sf: i32 = load<i32>(heapPtr + (<usize>i << 3));
    if (l < newLen) {
      const lf: i32 = load<i32>(heapPtr + (<usize>l << 3));
      if (lf < sf) { smallest = l; sf = lf; }
    }
    if (r < newLen) {
      const rf: i32 = load<i32>(heapPtr + (<usize>r << 3));
      if (rf < sf) { smallest = r; sf = rf; }
    }
    if (smallest == i) break;
    const af: i32 = load<i32>(heapPtr + (<usize>i << 3));
    const aIdx: i32 = load<i32>(heapPtr + (<usize>i << 3) + 4);
    const bf: i32 = load<i32>(heapPtr + (<usize>smallest << 3));
    const bIdx: i32 = load<i32>(heapPtr + (<usize>smallest << 3) + 4);
    store<i32>(heapPtr + (<usize>i << 3), bf);
    store<i32>(heapPtr + (<usize>i << 3) + 4, bIdx);
    store<i32>(heapPtr + (<usize>smallest << 3), af);
    store<i32>(heapPtr + (<usize>smallest << 3) + 4, aIdx);
    i = smallest;
  }
  return newLen;
}
