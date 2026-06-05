import { describe, it, expect } from "vitest";
import { Profiler } from "./profiler";

describe("Profiler", () => {
  it("is a no-op when disabled", () => {
    const p = new Profiler({ enabled: false });
    p.add("x", 1);
    p.add("x", 2);
    expect(p.stats("x")).toBeNull();
    expect(p.report()).toEqual({});
  });

  it("time() runs fn and returns its result even when disabled", () => {
    const p = new Profiler({ enabled: false });
    let ran = false;
    const out = p.time("x", () => {
      ran = true;
      return 42;
    });
    expect(ran).toBe(true);
    expect(out).toBe(42);
    expect(p.stats("x")).toBeNull();
  });

  it("computes count/mean/min/max over added samples", () => {
    const p = new Profiler({ enabled: true });
    for (const v of [2, 4, 6, 8]) p.add("d", v);
    const s = p.stats("d")!;
    expect(s.count).toBe(4);
    expect(s.mean).toBe(5);
    expect(s.min).toBe(2);
    expect(s.max).toBe(8);
    expect(s.last).toBe(8);
  });

  it("reports percentiles from the retained ring", () => {
    const p = new Profiler({ enabled: true });
    for (let i = 1; i <= 100; i += 1) p.add("d", i);
    const s = p.stats("d")!;
    // p50/p95 are order statistics of 1..100.
    expect(s.p50).toBeGreaterThanOrEqual(50);
    expect(s.p50).toBeLessThanOrEqual(52);
    expect(s.p95).toBeGreaterThanOrEqual(95);
    expect(s.p95).toBeLessThanOrEqual(97);
  });

  it("keeps only the last `capacity` samples but reports total count", () => {
    const p = new Profiler({ enabled: true, capacity: 4 });
    for (const v of [10, 10, 10, 10, 20, 20, 20, 20]) p.add("d", v);
    const s = p.stats("d")!;
    expect(s.count).toBe(8); // total ever added
    expect(s.mean).toBe(20); // ring only holds the last 4 (all 20)
    expect(s.min).toBe(20);
  });

  it("report() returns a plain structured-clone-friendly object", () => {
    const p = new Profiler({ enabled: true });
    p.add("a", 1);
    p.add("b", 2);
    const r = p.report();
    expect(Object.keys(r).sort()).toEqual(["a", "b"]);
    // Round-trips through structured-clone semantics (plain values only).
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });

  it("reset() drops samples", () => {
    const p = new Profiler({ enabled: true });
    p.add("a", 1);
    p.reset();
    expect(p.stats("a")).toBeNull();
  });
});
