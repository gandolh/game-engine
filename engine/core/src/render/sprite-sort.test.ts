import { describe, it, expect } from "vitest";
import { createRng } from "../runtime/rng";
import { compareSprite } from "./raster2d";
import { SpriteSorter } from "./sprite-sort";
import type { Sprite } from "./sprite-types";

function makeQueue(seed: number, n: number): Sprite[] {
  const rng = createRng(seed);
  const q: Sprite[] = [];
  for (let i = 0; i < n; i += 1) {
    // Few distinct layers and coarse y values, so exact ties are everywhere.
    const y = Math.floor(rng.nextFloat() * 40);
    const s: Sprite = {
      x: i,
      y,
      width: 16,
      height: 16,
      frame: "f",
      atlasId: "a",
      rotation: 0,
      layer: Math.floor(rng.nextFloat() * 6) * 10,
      alpha: 1,
    };
    if (rng.nextFloat() < 0.5) s.sortY = Math.floor(rng.nextFloat() * 40) + (rng.nextFloat() < 0.5 ? 0.5 : 0);
    q.push(s);
  }
  return q;
}

function sortWith(sorter: SpriteSorter, queue: Sprite[], n: number): void {
  for (let i = 0; i < n; i += 1) {
    const s = queue[i] as Sprite;
    sorter.setKey(i, s.layer, s.sortY ?? s.y);
  }
  sorter.sort(queue, n);
}

/** Index of the first place two queues hold different sprites (identity, so ties are pinned), or -1. */
function firstDiff(actual: Sprite[], expected: Sprite[]): number {
  if (actual.length !== expected.length) return Math.min(actual.length, expected.length);
  return expected.findIndex((s, k) => actual[k] !== s);
}

describe("SpriteSorter", () => {
  it.each([1, 2, 3, 4, 5])("matches queue.slice().sort(compareSprite) for seed %i, and after a moved frame", (seed) => {
    const sorter = new SpriteSorter();
    const q = makeQueue(seed, 3000);
    const expected = q.slice().sort(compareSprite);
    sortWith(sorter, q, q.length);
    expect(firstDiff(q, expected)).toBe(-1);

    // Second frame: the same push order, some sprites moved, so last frame's order is a near miss.
    const rng = createRng(seed * 101);
    const q2 = makeQueue(seed, 3000);
    for (const s of q2) {
      if (rng.nextFloat() < 0.1) s.y += Math.floor(rng.nextFloat() * 5) - 2;
    }
    const expected2 = q2.slice().sort(compareSprite);
    sortWith(sorter, q2, q2.length);
    expect(firstDiff(q2, expected2)).toBe(-1);

    // Third frame: a different length, then a reshuffled scene (the fallback path).
    const q3 = makeQueue(seed + 50, 2500);
    const expected3 = q3.slice().sort(compareSprite);
    sortWith(sorter, q3, q3.length);
    expect(firstDiff(q3, expected3)).toBe(-1);
    const q4 = makeQueue(seed + 60, 2500);
    const expected4 = q4.slice().sort(compareSprite);
    sortWith(sorter, q4, q4.length);
    expect(firstDiff(q4, expected4)).toBe(-1);
  });

  it("orders negatives, zeros of both signs, fractions and large values like the comparator", () => {
    const sorter = new SpriteSorter();
    const rng = createRng(77);
    const pool = [-0, 0, -1, 1, -0.5, 0.25, 1e-9, -1e-9, 1e7, -1e7, 123.456, -123.456, 3.5];
    const q: Sprite[] = [];
    for (let i = 0; i < 1500; i += 1) {
      const y = rng.pick(pool);
      q.push({
        x: i,
        y,
        width: 1,
        height: 1,
        frame: "f",
        atlasId: "a",
        rotation: 0,
        layer: rng.pick([-5, -0, 0, 0.5, 2, 1000]),
        alpha: 1,
        ...(i % 4 === 0 ? { sortY: rng.pick(pool) } : {}),
      });
    }
    const expected = q.slice().sort(compareSprite);
    sortWith(sorter, q, q.length);
    expect(firstDiff(q, expected)).toBe(-1);
  });

  it("matches the comparator on a nearly sorted queue (the insertion shortcut), ties included", () => {
    const sorter = new SpriteSorter();
    const rng = createRng(31);
    const q = makeQueue(8, 3000).sort(compareSprite);
    for (let i = 0; i < 300; i += 1) {
      const a = rng.int(0, q.length - 1);
      const b = Math.min(q.length - 1, a + rng.int(1, 6));
      const t = q[a] as Sprite;
      q[a] = q[b] as Sprite;
      q[b] = t;
    }
    const expected = q.slice().sort(compareSprite);
    sortWith(sorter, q, q.length);
    expect(firstDiff(q, expected)).toBe(-1);
  });

  it("sorts only the first n entries", () => {
    const sorter = new SpriteSorter();
    const q = makeQueue(9, 50);
    const head = q.slice(0, 30).sort(compareSprite);
    const tail = q.slice(30);
    sortWith(sorter, q, 30);
    expect(firstDiff(q.slice(0, 30), head)).toBe(-1);
    expect(firstDiff(q.slice(30), tail)).toBe(-1);
  });
});
