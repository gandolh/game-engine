// audit-21: the JS (BFS) and WASM (A*) pathfinders both satisfy `PathfinderLike`,
// but they are only shortest-LENGTH equivalent, not ROUTE equivalent — BFS visits
// neighbours in a fixed DX/DY order with no tie-break heuristic, A* explores by
// cost/heuristic order, so on grids with more than one equal-cost path they pick
// different equal-cost routes. That divergence is known and deliberate (see
// corpus/wiki/decisions.md → Concurrency, "Pathfinder choice is load-bearing")
// and headless `run-sim` defaults to JS while everything players actually see
// (browser clients, both servers) uses WASM (see tools/run-sim/src/pathfinder.ts).
//
// This suite does NOT assert route equality — that would be wrong, since routes
// are expected to differ. It asserts the contract callers actually rely on:
// same shortest-path length, same reachability verdict, identical wall/blocked
// handling, and that each implementation is deterministic on repeated calls.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { JsPathfinder } from "./js-pathfinder";
import { createPathfinderFromBytes, type Pathfinder, type PathfinderGrid } from "@engine/core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const wasmPath = resolve(__dirname, "../../../../../engine/wasm-modules/dist/pathfinding.wasm");

function loadBytes(): ArrayBuffer {
  const buf = readFileSync(wasmPath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

interface Point {
  x: number;
  y: number;
}

interface Grid extends PathfinderGrid {
  width: number;
  height: number;
}

// Builds a width x height grid of open (0) cells, then marks `walls` as blocked (1).
function buildGrid(width: number, height: number, walls: Point[] = []): Grid {
  const cells = new Uint8Array(width * height);
  for (const w of walls) cells[w.y * width + w.x] = 1;
  return { cells, width, height };
}

// -- Hand-built fixtures -----------------------------------------------------

// 10x10 open field, no obstacles.
const OPEN_FIELD: Grid = buildGrid(10, 10);
const OPEN_START: Point = { x: 0, y: 0 };
const OPEN_END: Point = { x: 9, y: 9 };

// 10x10 walled corridor: a single vertical wall with one gap forces both
// pathfinders through the same chokepoint, but they may approach it via
// different equal-cost detours.
const CORRIDOR_WALLS: Point[] = [];
for (let y = 0; y < 10; y++) {
  if (y !== 5) CORRIDOR_WALLS.push({ x: 4, y });
}
const CORRIDOR: Grid = buildGrid(10, 10, CORRIDOR_WALLS);
const CORRIDOR_START: Point = { x: 0, y: 0 };
const CORRIDOR_END: Point = { x: 9, y: 9 };

// 10x10 U-shaped trap: a 3-sided box open only at the top, forcing a detour
// up and over rather than a straight line.
const U_TRAP_WALLS: Point[] = [];
for (let x = 2; x <= 6; x++) U_TRAP_WALLS.push({ x, y: 7 }); // bottom of the U
for (let y = 3; y <= 7; y++) {
  U_TRAP_WALLS.push({ x: 2, y }); // left arm
  U_TRAP_WALLS.push({ x: 6, y }); // right arm
}
const U_TRAP: Grid = buildGrid(10, 10, U_TRAP_WALLS);
const U_TRAP_START: Point = { x: 4, y: 6 }; // inside the U, must exit via the top gap
const U_TRAP_END: Point = { x: 4, y: 9 };

// 10x10 fully sealed wall with no gap: target is unreachable.
const SEALED_WALLS: Point[] = [];
for (let y = 0; y < 10; y++) SEALED_WALLS.push({ x: 5, y });
const UNREACHABLE: Grid = buildGrid(10, 10, SEALED_WALLS);
const UNREACHABLE_START: Point = { x: 0, y: 0 };
const UNREACHABLE_END: Point = { x: 9, y: 9 };

// start === end.
const SAME_POINT: Grid = buildGrid(10, 10);
const SAME_POINT_XY: Point = { x: 3, y: 3 };

interface Fixture {
  name: string;
  grid: Grid;
  start: Point;
  end: Point;
  reachable: boolean;
}

const FIXTURES: Fixture[] = [
  { name: "open field", grid: OPEN_FIELD, start: OPEN_START, end: OPEN_END, reachable: true },
  { name: "walled corridor with one gap", grid: CORRIDOR, start: CORRIDOR_START, end: CORRIDOR_END, reachable: true },
  { name: "U-shaped trap", grid: U_TRAP, start: U_TRAP_START, end: U_TRAP_END, reachable: true },
  { name: "sealed wall, unreachable target", grid: UNREACHABLE, start: UNREACHABLE_START, end: UNREACHABLE_END, reachable: false },
  { name: "start === end", grid: SAME_POINT, start: SAME_POINT_XY, end: SAME_POINT_XY, reachable: true },
];

function isWalkable(grid: Grid, p: Point): boolean {
  return grid.cells[p.y * grid.width + p.x] === 0;
}

function assertNoWallCrossing(grid: Grid, path: Point[]): void {
  for (const p of path) {
    expect(isWalkable(grid, p), `path must not cross a blocked cell at (${p.x},${p.y})`).toBe(true);
  }
}

describe("JS (BFS) vs WASM (A*) pathfinder equivalence", () => {
  let wasmPf: Pathfinder;
  const jsPf = new JsPathfinder();

  it("loads the committed WASM pathfinder kernel", async () => {
    wasmPf = await createPathfinderFromBytes(loadBytes());
    expect(wasmPf).toBeTruthy();
  });

  for (const fx of FIXTURES) {
    it(`${fx.name}: same reachability verdict`, async () => {
      wasmPf ??= await createPathfinderFromBytes(loadBytes());
      const jsPath = jsPf.findPath(fx.grid, fx.start, fx.end);
      const wasmPath = wasmPf.findPath(fx.grid, fx.start, fx.end);
      expect(jsPath.length > 0).toBe(fx.reachable);
      expect(wasmPath.length > 0).toBe(fx.reachable);
    });

    if (fx.reachable) {
      it(`${fx.name}: same shortest-path length`, async () => {
        wasmPf ??= await createPathfinderFromBytes(loadBytes());
        const jsPath = jsPf.findPath(fx.grid, fx.start, fx.end);
        const wasmPath = wasmPf.findPath(fx.grid, fx.start, fx.end);
        expect(jsPath.length).toBe(wasmPath.length);
      });

      it(`${fx.name}: both respect walls identically (no cell in either path is blocked)`, async () => {
        wasmPf ??= await createPathfinderFromBytes(loadBytes());
        const jsPath = jsPf.findPath(fx.grid, fx.start, fx.end);
        const wasmPath = wasmPf.findPath(fx.grid, fx.start, fx.end);
        assertNoWallCrossing(fx.grid, jsPath);
        assertNoWallCrossing(fx.grid, wasmPath);
      });

      it(`${fx.name}: both paths start and end at the requested points`, async () => {
        wasmPf ??= await createPathfinderFromBytes(loadBytes());
        const jsPath = jsPf.findPath(fx.grid, fx.start, fx.end);
        const wasmPath = wasmPf.findPath(fx.grid, fx.start, fx.end);
        expect(jsPath[0]).toEqual(fx.start);
        expect(jsPath[jsPath.length - 1]).toEqual(fx.end);
        expect(wasmPath[0]).toEqual(fx.start);
        expect(wasmPath[wasmPath.length - 1]).toEqual(fx.end);
      });
    }
  }

  it("JS pathfinder is individually deterministic: same inputs produce the same route on every call", () => {
    const first = jsPf.findPath(CORRIDOR, CORRIDOR_START, CORRIDOR_END);
    for (let i = 0; i < 5; i++) {
      const again = jsPf.findPath(CORRIDOR, CORRIDOR_START, CORRIDOR_END);
      expect(again).toEqual(first);
    }
  });

  it("WASM pathfinder is individually deterministic: same inputs produce the same route on every call", async () => {
    wasmPf ??= await createPathfinderFromBytes(loadBytes());
    const first = wasmPf.findPath(CORRIDOR, CORRIDOR_START, CORRIDOR_END);
    for (let i = 0; i < 5; i++) {
      const again = wasmPf.findPath(CORRIDOR, CORRIDOR_START, CORRIDOR_END);
      expect(again).toEqual(first);
    }
  });

  it("NOTE: routes are expected to differ between implementations on grids with more than one shortest path — do not assert route equality", async () => {
    wasmPf ??= await createPathfinderFromBytes(loadBytes());
    // Documented, not enforced: BFS (JS) explores neighbours in a fixed DX/DY
    // order with no tie-break; A* (WASM) explores by cost/heuristic. On the
    // corridor fixture there are multiple equal-length routes to the gap, so
    // the two implementations are free to (and observed to) choose different
    // ones while still agreeing on length and reachability, asserted above.
    const jsPath = jsPf.findPath(CORRIDOR, CORRIDOR_START, CORRIDOR_END);
    const wasmPath = wasmPf.findPath(CORRIDOR, CORRIDOR_START, CORRIDOR_END);
    expect(jsPath.length).toBe(wasmPath.length);
  });
});
