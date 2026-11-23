import { describe, expect, it } from "vitest";
import type { Sprite } from "../sprite-types";
import { GHOST_GRID_MIN_WORK, GhostGrid, ghostCoveredLinear, ghostLinearWork } from "./ghost-grid";

const UI_LAYER = 80;

/** A small seeded generator, so a failing scene can be replayed. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function sprite(over: Partial<Sprite>): Sprite {
  return { x: 0, y: 0, width: 16, height: 16, frame: "f", atlasId: "a", rotation: 0, layer: 1, alpha: 1, ...over };
}

function candidatesOf(queue: readonly Sprite[]): number[] {
  const idx: number[] = [];
  queue.forEach((s, i) => {
    if (s.occludable) idx.push(i);
  });
  return idx;
}

/** Every candidate's answer from the grid must equal the plain scan's. Returns how many were covered. */
function expectSame(queue: Sprite[]): number {
  const cand = candidatesOf(queue);
  const grid = new GhostGrid();
  grid.build(queue, queue.length, cand, cand.length, UI_LAYER);
  let covered = 0;
  for (const i of cand) {
    const g = queue[i] as Sprite;
    const want = ghostCoveredLinear(queue, queue.length, i, g, UI_LAYER);
    expect(grid.covered(i, g), `candidate ${i}`).toBe(want);
    if (want) covered += 1;
  }
  return covered;
}

describe("GhostGrid matches the plain ghost check", () => {
  it("agrees on random dense scenes, with sprites on cell borders, lifts and UI layers", () => {
    let totalCovered = 0;
    let totalUncovered = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const rnd = lcg(seed);
      const queue: Sprite[] = [];
      const n = 400;
      for (let i = 0; i < n; i += 1) {
        // Half the scenes snap to an 8-unit lattice so edges land exactly on cell borders.
        const snap = seed % 2 === 0;
        const w = snap ? 16 : 6 + rnd() * 26;
        const h = snap ? 16 : 6 + rnd() * 26;
        const x = snap ? Math.round((rnd() * 240) / 8) * 8 : rnd() * 240;
        const y = snap ? Math.round((rnd() * 240) / 8) * 8 : rnd() * 240;
        const kind = rnd();
        queue.push(
          sprite({
            x,
            y,
            width: w,
            height: h,
            occludable: kind < 0.3,
            layer: kind > 0.93 ? UI_LAYER + 1 : 1,
            ...(rnd() < 0.15 ? { z: Math.round(rnd() * 3) * 8 } : {}),
          }),
        );
      }
      const covered = expectSame(queue);
      totalCovered += covered;
      totalUncovered += candidatesOf(queue).length - covered;
    }
    // The scenes must exercise both answers.
    expect(totalCovered).toBeGreaterThan(100);
    expect(totalUncovered).toBeGreaterThan(0);
  });

  it("counts only sprites later in the queue", () => {
    const queue = [
      sprite({ x: 0, y: 0 }), // before the occluder: overlaps it, must not count
      sprite({ x: 100, y: 100, occludable: true }), // the occluder, far from both
      sprite({ x: 200, y: 0 }),
      sprite({ x: 100, y: 100 }), // after: covers it
      sprite({ x: 0, y: 0, occludable: true }), // overlaps nothing after it
    ];
    const cand = candidatesOf(queue);
    const grid = new GhostGrid();
    grid.build(queue, queue.length, cand, cand.length, UI_LAYER);
    expect(grid.covered(1, queue[1] as Sprite)).toBe(true);
    expect(grid.covered(4, queue[4] as Sprite)).toBe(false);
    expectSame(queue);

    // Same scene with the covering sprite moved in front of the occluder: nothing covers it.
    const before = [queue[3] as Sprite, queue[1] as Sprite, queue[2] as Sprite];
    const c2 = candidatesOf(before);
    grid.build(before, before.length, c2, c2.length, UI_LAYER);
    expect(grid.covered(1, before[1] as Sprite)).toBe(false);
    expectSame(before);
  });

  it("ignores occludable and UI-layer sprites as coverers, and handles an empty queue", () => {
    const queue = [
      sprite({ occludable: true }),
      sprite({ occludable: true }),
      sprite({ layer: UI_LAYER }),
      sprite({ layer: UI_LAYER + 5 }),
    ];
    expect(expectSame(queue)).toBe(0);
    expectSame([]);
    expectSame([sprite({ occludable: true })]);
  });

  it("reuses its arrays across frames and still answers right", () => {
    const grid = new GhostGrid();
    for (const seed of [11, 12, 13]) {
      const rnd = lcg(seed);
      const queue: Sprite[] = [];
      for (let i = 0; i < 120 * (seed - 10); i += 1) {
        queue.push(sprite({ x: rnd() * 300, y: rnd() * 300, occludable: rnd() < 0.3 }));
      }
      const cand = candidatesOf(queue);
      grid.build(queue, queue.length, cand, cand.length, UI_LAYER);
      for (const i of cand) {
        const g = queue[i] as Sprite;
        expect(grid.covered(i, g)).toBe(ghostCoveredLinear(queue, queue.length, i, g, UI_LAYER));
      }
    }
  });

  it("estimates the plain scan's work as the sum of the sprites after each candidate", () => {
    expect(ghostLinearWork(10, [0, 4, 9], 3)).toBe(9 + 5 + 0);
    expect(ghostLinearWork(10, [0, 4, 9], 2)).toBe(14);
    expect(ghostLinearWork(0, [], 0)).toBe(0);
  });

  it("is at least 5 times faster on a crowd behind walls (hundreds of occluders, thousands of sprites)", () => {
    const rnd = lcg(99);
    const queue: Sprite[] = [];
    // Occluders sort first, so each one has the whole crowd after it: the plain scan's worst case.
    for (let i = 0; i < 300; i += 1) {
      queue.push(sprite({ x: rnd() * 2400, y: rnd() * 2400, width: 16, height: 24, occludable: true }));
    }
    for (let i = 0; i < 4000; i += 1) {
      queue.push(sprite({ x: rnd() * 2400, y: rnd() * 2400, width: 12, height: 12 }));
    }
    const cand = candidatesOf(queue);
    const grid = new GhostGrid();
    expect(ghostLinearWork(queue.length, cand, cand.length)).toBeGreaterThan(GHOST_GRID_MIN_WORK);

    const runLinear = (): number => {
      let n = 0;
      for (const i of cand) if (ghostCoveredLinear(queue, queue.length, i, queue[i] as Sprite, UI_LAYER)) n += 1;
      return n;
    };
    const runGrid = (): number => {
      grid.build(queue, queue.length, cand, cand.length, UI_LAYER);
      let n = 0;
      for (const i of cand) if (grid.covered(i, queue[i] as Sprite)) n += 1;
      return n;
    };
    expect(runGrid()).toBe(runLinear());
    runLinear();

    const time = (fn: () => number, reps: number): number => {
      const t0 = performance.now();
      for (let r = 0; r < reps; r += 1) fn();
      return (performance.now() - t0) / reps;
    };
    const linearMs = time(runLinear, 5);
    const gridMs = time(runGrid, 50);
    console.warn(
      `ghost check, 300 occluders x 4000 sprites: linear ${linearMs.toFixed(3)} ms, grid ${gridMs.toFixed(3)} ms`,
    );
    expect(linearMs / gridMs).toBeGreaterThanOrEqual(5);
  });
});
