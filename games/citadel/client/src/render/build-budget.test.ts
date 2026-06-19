import { describe, it, expect } from "vitest";
import { IncrementalQueue } from "./build-budget";

describe("Citadel 22 — incremental build queue + per-frame budget", () => {
  it("coalesces duplicate enqueues by key (maybeEnsure gate)", () => {
    const q = new IncrementalQueue<{ x: number; y: number }>((i) => `${i.x},${i.y}`);
    q.enqueue({ x: 1, y: 2 });
    q.enqueue({ x: 1, y: 2 });
    q.enqueue({ x: 3, y: 4 });
    expect(q.size).toBe(2);
    expect(q.has({ x: 1, y: 2 })).toBe(true);
  });

  it("drains at most `budget` items per frame, FIFO, across frames", () => {
    const q = new IncrementalQueue<number>((i) => String(i));
    for (let i = 0; i < 10; i++) q.enqueue(i);
    expect(q.drain(3)).toEqual([0, 1, 2]);
    expect(q.drain(3)).toEqual([3, 4, 5]);
    expect(q.size).toBe(4);
    expect(q.drain(100)).toEqual([6, 7, 8, 9]); // budget caps at what's available
    expect(q.size).toBe(0);
  });

  it("frees a key once drained so it can be re-enqueued", () => {
    const q = new IncrementalQueue<number>((i) => String(i));
    q.enqueue(5);
    q.drain(1);
    expect(q.size).toBe(0);
    q.enqueue(5);
    expect(q.size).toBe(1);
  });

  it("clear() drops everything", () => {
    const q = new IncrementalQueue<number>((i) => String(i));
    q.enqueue(1); q.enqueue(2);
    q.clear();
    expect(q.size).toBe(0);
    expect(q.has(1)).toBe(false);
  });
});
