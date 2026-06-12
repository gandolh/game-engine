import { describe, expect, it, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createPathfinderFromBytes, Pathfinder } from "./pathfinder";

const __dirname = dirname(fileURLToPath(import.meta.url));
const wasmPath = resolve(__dirname, "../../../wasm-modules/dist/pathfinding.wasm");

async function loadBytes(): Promise<ArrayBuffer> {
  const buf = await readFile(wasmPath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe("Pathfinder (wasm A*)", () => {
  let pf: Pathfinder;

  beforeAll(async () => {
    const bytes = await loadBytes();
    pf = await createPathfinderFromBytes(bytes);
  });

  it("finds the trivial straight path on an empty 5x1 strip", () => {
    const cells = new Uint8Array(5);
    const path = pf.findPath({ cells, width: 5, height: 1 }, { x: 0, y: 0 }, { x: 4, y: 0 });
    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 },
    ]);
  });

  it("routes around a wall", () => {
    const w = 5, h = 5;
    const cells = new Uint8Array(w * h);
    for (let y = 0; y < 4; y++) cells[y * w + 2] = 1;
    const path = pf.findPath({ cells, width: w, height: h }, { x: 0, y: 0 }, { x: 4, y: 0 });
    expect(path.length).toBeGreaterThan(0);
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[path.length - 1]).toEqual({ x: 4, y: 0 });
    expect(path.some((p) => p.y === 4)).toBe(true);
    for (const p of path) {
      expect(cells[p.y * w + p.x]).toBe(0);
    }
    expect(path.length).toBe(13); // 4 horizontal + 8 detour through gap
  });

  it("returns empty array when no path exists", () => {
    // Full vertical wall blocks the end.
    const w = 5, h = 5;
    const cells = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) cells[y * w + 2] = 1;
    const path = pf.findPath({ cells, width: w, height: h }, { x: 0, y: 0 }, { x: 4, y: 0 });
    expect(path).toEqual([]);
  });

  it("returns empty when start or end is blocked", () => {
    const cells = new Uint8Array(9);
    cells[4] = 1; // center blocked
    const w = 3, h = 3;
    expect(pf.findPath({ cells, width: w, height: h }, { x: 1, y: 1 }, { x: 2, y: 2 })).toEqual([]);
    expect(pf.findPath({ cells, width: w, height: h }, { x: 0, y: 0 }, { x: 1, y: 1 })).toEqual([]);
  });

  it("returns empty when coordinates are out of bounds", () => {
    const cells = new Uint8Array(9);
    const grid = { cells, width: 3, height: 3 };
    expect(pf.findPath(grid, { x: -1, y: 0 }, { x: 2, y: 2 })).toEqual([]);
    expect(pf.findPath(grid, { x: 0, y: 0 }, { x: 3, y: 2 })).toEqual([]);
  });

  it("rejects mismatched grid sizes", () => {
    const cells = new Uint8Array(10);
    expect(() =>
      pf.findPath({ cells, width: 3, height: 3 }, { x: 0, y: 0 }, { x: 2, y: 2 }),
    ).toThrow(/cells.length/);
  });

  it("handles repeated calls without leaking memory growth", async () => {
    const w = 64, h = 64;
    const cells = new Uint8Array(w * h);
    for (let i = 0; i < 50; i++) {
      const path = pf.findPath({ cells, width: w, height: h }, { x: 0, y: 0 }, { x: 63, y: 63 });
      expect(path.length).toBe(127);
    }
  });
});

describe("Pathfinder (wasm A*) — allocator churn regression (brief 10)", () => {
  // Regression test for: stub-runtime bump allocator leak in findPath.
  // Pre-fix, gridPtr (cells.length bytes) was freed before outPtr, making free a no-op
  // for gridPtr (stub only reclaims the last-allocated chunk). With a 160×160 grid
  // (~25.6 KB/call), the heap exhausted within ~655 calls → RuntimeError: unreachable.
  // Post-fix: free in reverse allocation order (outPtr first, then gridPtr); both reclaimed.
  it("survives 800 sequential findPath calls on a 160×160 grid without RuntimeError", async () => {
    const bytes = await loadBytes();
    // Fresh Pathfinder instance so prior-test state does not affect the call count.
    const freshPf = await createPathfinderFromBytes(bytes);

    const w = 160, h = 160;
    const cells = new Uint8Array(w * h); // all walkable
    const start = { x: 0, y: 0 };
    const end = { x: w - 1, y: h - 1 };

    // 800 calls > 655-call threshold where pre-fix code exhausted the WASM heap.
    for (let i = 0; i < 800; i++) {
      // Must not throw.
      const path = freshPf.findPath({ cells, width: w, height: h }, start, end);
      // Path must remain valid every iteration — allocator corruption would break this.
      expect(path.length).toBeGreaterThan(0);
      expect(path[0]).toEqual(start);
      expect(path[path.length - 1]).toEqual(end);
    }
  });
});
