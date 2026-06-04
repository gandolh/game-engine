// AssemblyScript module: grid A* pathfinding.
//
// Memory contract:
//   - Heap is managed by AssemblyScript's TLSF allocator (stub runtime).
//   - Host calls `alloc(size)` to reserve scratch in the wasm linear memory,
//     writes inputs at the returned pointer, calls `findPath`, then `free`s.
//   - The grid is row-major u8 (0 = walkable, anything else = blocked).
//   - The output buffer receives i32 pairs (x, y) one waypoint per pair,
//     ordered from start -> end.
//
// Scratch-buffer reuse:
//   Four module-level static buffers (gScore, parent, closed, heapBuf) are
//   allocated once on first use and grown on-demand when a larger grid is
//   requested.  They are NEVER freed between calls — only their contents are
//   reset at the start of each findPath invocation.  This eliminates the
//   alloc/free churn that intermittently exhausted the stub-runtime bump
//   allocator and caused "RuntimeError: unreachable" traps under heavy load.

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

// ---------------------------------------------------------------------------
// Module-level scratch buffers.  Null (0) means "not yet allocated".
// scratchCap tracks the number of cells the current allocations can hold.
// ---------------------------------------------------------------------------
let scratchGScore: usize = 0;  // i32[total]  — best known cost
let scratchParent: usize = 0;  // i32[total]  — predecessor index
let scratchClosed: usize = 0;  // u8[total]   — closed-set flags
let scratchHeap:   usize = 0;  // i64[total+1] — binary-heap entries (f,idx)
let scratchCap:    i32   = 0;  // cells the current buffers can hold

@inline
function ensureScratch(total: i32): void {
  if (total <= scratchCap) return;

  // Grow: free old buffers only if they were previously allocated.
  if (scratchCap > 0) {
    heap.free(scratchGScore);
    heap.free(scratchParent);
    heap.free(scratchClosed);
    heap.free(scratchHeap);
  }

  scratchGScore = heap.alloc(<usize>(total << 2));          // 4 bytes per i32
  scratchParent = heap.alloc(<usize>(total << 2));
  scratchClosed = heap.alloc(<usize>total);                 // 1 byte per u8
  scratchHeap   = heap.alloc(<usize>((total + 1) << 3));   // 8 bytes per entry
  scratchCap    = total;
}

/**
 * 4-connected A* on a u8 grid.
 *
 * @param gridPtr  pointer to width*height u8 cells (row-major; 0 walkable)
 * @param width    grid width in cells
 * @param height   grid height in cells
 * @param startX   start cell X
 * @param startY   start cell Y
 * @param endX     end cell X
 * @param endY     end cell Y
 * @param outPtr   pointer to the host-allocated output buffer
 * @param outCap   capacity of the output buffer in i32 (so outCap/2 waypoints)
 * @returns        number of waypoints written, or 0 when unreachable / bad input
 */
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

  // Reject if endpoints sit on a blocked cell.
  if (load<u8>(gridPtr + <usize>startIdx) != 0) return 0;
  if (load<u8>(gridPtr + <usize>endIdx) != 0) return 0;

  // Ensure scratch buffers are large enough for this grid.
  ensureScratch(total);

  // Reset scratch arrays.
  //   gScore: sentinel = i32.MAX_VALUE
  //   parent: sentinel = -1  (all-ones in two's complement)
  //   closed: all 0
  memory.fill(scratchClosed, 0, <usize>total);
  for (let i: i32 = 0; i < total; i++) {
    store<i32>(scratchGScore + (<usize>i << 2), i32.MAX_VALUE);
    store<i32>(scratchParent + (<usize>i << 2), -1);
  }

  // Binary min-heap keyed on fScore. Each entry packs f (i32) then idx (i32).
  let heapLen: i32 = 0;

  store<i32>(scratchGScore + (<usize>startIdx << 2), 0);
  heapLen = push(scratchHeap, heapLen, manhattan(startX, startY, endX, endY), startIdx);

  let found: bool = false;

  while (heapLen > 0) {
    // Pop min.
    const topIdx: i32 = load<i32>(scratchHeap + 4);
    const topF: i32 = load<i32>(scratchHeap);
    heapLen = popMin(scratchHeap, heapLen);

    if (load<u8>(scratchClosed + <usize>topIdx) != 0) continue;
    store<u8>(scratchClosed + <usize>topIdx, 1);

    if (topIdx == endIdx) {
      found = true;
      break;
    }
    // Stale entry guard: if f no longer matches gScore + h, skip.
    // (We don't decrease-key; we just push duplicates and drop closed pops.)
    // No-op here — `closed` already covers it.
    let _unused: i32 = topF;
    _unused = _unused;

    const cy: i32 = topIdx / width;
    const cx: i32 = topIdx - cy * width;
    const cg: i32 = load<i32>(scratchGScore + (<usize>topIdx << 2));

    // 4 neighbors: (-1,0), (1,0), (0,-1), (0,1)
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
    // Walk parent chain end -> start, then reverse into outPtr.
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

  // NOTE: scratch buffers are intentionally NOT freed here.
  // They are reused by the next findPath call, eliminating allocator churn.
  return written;
}

// --- Binary heap helpers (min-heap on fScore) ---------------------------------

@inline
function push(heapPtr: usize, heapLen: i32, f: i32, idx: i32): i32 {
  let i: i32 = heapLen;
  store<i32>(heapPtr + (<usize>i << 3), f);
  store<i32>(heapPtr + (<usize>i << 3) + 4, idx);
  // Sift up.
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
  // Sift down.
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
