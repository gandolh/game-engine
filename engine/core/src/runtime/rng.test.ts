import { describe, it, expect } from "vitest";
import { createRng, restoreRng } from "./rng";

describe("Rng (mulberry32)", () => {
  describe("determinism", () => {
    it("same seed produces identical sequences", () => {
      const r1 = createRng(42);
      const r2 = createRng(42);
      for (let i = 0; i < 10; i++) {
        expect(r1.nextU32()).toBe(r2.nextU32());
      }
    });

    it("different seeds produce different sequences", () => {
      const r1 = createRng(1);
      const r2 = createRng(2);
      const seq1 = Array.from({ length: 10 }, () => r1.nextU32());
      const seq2 = Array.from({ length: 10 }, () => r2.nextU32());
      expect(seq1).not.toEqual(seq2);
    });
  });

  describe("snapshot / restoreRng round-trip", () => {
    it("restores state exactly — same outputs after restore", () => {
      const r1 = createRng(99999);
      for (let i = 0; i < 5; i++) r1.nextU32();
      const snap = r1.snapshot();
      const seqA = Array.from({ length: 8 }, () => r1.nextU32());
      const r2 = restoreRng(snap);
      const seqB = Array.from({ length: 8 }, () => r2.nextU32());
      expect(seqA).toEqual(seqB);
    });

    it("snapshot carries original seed", () => {
      const r = createRng(12345);
      const snap = r.snapshot();
      expect(snap.seed).toBe(12345);
    });
  });

  describe("range", () => {
    it("stays within [min, max) across 10k samples", () => {
      const r = createRng(777);
      const min = -5;
      const max = 10;
      for (let i = 0; i < 10_000; i++) {
        const v = r.range(min, max);
        expect(v).toBeGreaterThanOrEqual(min);
        expect(v).toBeLessThan(max);
      }
    });
  });

  describe("pick", () => {
    it("throws on empty array", () => {
      const r = createRng(1);
      expect(() => r.pick([])).toThrow("Rng.pick: empty array");
    });

    it("always returns an element from the array", () => {
      const r = createRng(42);
      const arr = ["a", "b", "c", "d"] as const;
      for (let i = 0; i < 100; i++) {
        expect(arr).toContain(r.pick(arr));
      }
    });
  });

  describe("fork determinism", () => {
    it("same parent state + same label produces same child sequence", () => {
      const r1 = createRng(555);
      const r2 = createRng(555);
      const child1 = r1.fork("pathfinder");
      const child2 = r2.fork("pathfinder");
      for (let i = 0; i < 10; i++) {
        expect(child1.nextU32()).toBe(child2.nextU32());
      }
    });

    it("different labels yield different child sequences", () => {
      const r1 = createRng(555);
      const r2 = createRng(555);
      const childA = r1.fork("alpha");
      const childB = r2.fork("beta");
      const seqA = Array.from({ length: 5 }, () => childA.nextU32());
      const seqB = Array.from({ length: 5 }, () => childB.nextU32());
      expect(seqA).not.toEqual(seqB);
    });

    it("fork is deterministic after snapshot restore", () => {
      const r1 = createRng(1234);
      for (let i = 0; i < 3; i++) r1.nextU32();
      const snap = r1.snapshot();

      const child1 = r1.fork("worker");
      const seq1 = Array.from({ length: 5 }, () => child1.nextU32());

      const r2 = restoreRng(snap);
      const child2 = r2.fork("worker");
      const seq2 = Array.from({ length: 5 }, () => child2.nextU32());

      expect(seq1).toEqual(seq2);
    });
  });
});

// ---------------------------------------------------------------------------
// Golden vectors — audit-45
//
// Every other test in this file is SELF-REFERENTIAL: it compares two live
// instances of the same code. `CHECK_DETERMINISM=1` has the same shape — it runs
// one seed twice in one build. Those prove REPRODUCIBILITY. They cannot prove
// STABILITY, so the mulberry32 constant, the FNV-1a constants in `fork`, or the
// `nextU32()` call inside `fork` that advances the PARENT stream could all be
// changed or "tidied away" with the whole suite staying green.
//
// The numbers below are hardcoded output of the implementation as it stands.
// They are the only thing in the repo pinning the actual stream.
//
// IF THESE FAIL, THE FIX IS ALMOST NEVER TO UPDATE THE NUMBERS. Every Citadel
// save replays through this stream (seed + event-sourced input log), every Farm
// scenario and every balance figure in corpus/wiki/economy.md is downstream of
// it, and all four games re-baseline at once. A red golden test means: either
// revert the change to rng.ts, or make re-baselining the four games an explicit,
// recorded decision and regenerate these on purpose.
// ---------------------------------------------------------------------------

describe("golden vectors (stability, not just reproducibility)", () => {
  it("createRng(42) emits the pinned first 8 u32 values", () => {
    const r = createRng(42);
    expect(Array.from({ length: 8 }, () => r.nextU32())).toEqual([
      2581720956, 1925393290, 3661312704, 2876485805, 750819978, 2261697747, 1173505300, 2683257857,
    ]);
  });

  it("createRng(2024) emits the pinned first 4 floats", () => {
    const r = createRng(2024);
    expect(Array.from({ length: 4 }, () => r.nextFloat())).toEqual([
      0.811762373894453, 0.7108214949257672, 0.6505258858669549, 0.6853262642398477,
    ]);
  });

  it('createRng(1).fork("pathfinder") emits the pinned first 4 u32 values', () => {
    const child = createRng(1).fork("pathfinder");
    expect(Array.from({ length: 4 }, () => child.nextU32())).toEqual([
      1420510029, 2657208518, 1626069229, 394996453,
    ]);
  });

  it("a nested fork emits the pinned values — derivation ORDER is the fragile part", () => {
    const nested = createRng(7).fork("outer").fork("inner");
    expect(Array.from({ length: 4 }, () => nested.nextU32())).toEqual([
      3245074439, 2722241300, 237095765, 3583303008,
    ]);
  });

  it("fork() consumes a draw from the PARENT stream", () => {
    // Documented, order-sensitive, and load-bearing: reordering fork calls
    // re-rolls every run downstream of them. Carried only by a comment in
    // rng.ts until now.
    const r = createRng(9);
    r.fork("a");
    expect(r.nextU32()).toBe(3655922532);
    expect(createRng(9).nextU32()).toBe(853534204);
    expect(r.snapshot().state).not.toBe(createRng(9).snapshot().state);
  });
});

describe("int / range bounds", () => {
  it("int throws when maxExclusive <= minInclusive", () => {
    const r = createRng(1);
    expect(() => r.int(5, 5)).toThrow("Rng.int: maxExclusive must be > minInclusive");
    expect(() => r.int(5, 4)).toThrow("Rng.int: maxExclusive must be > minInclusive");
  });

  it("int stays within [minInclusive, maxExclusive) across 10k samples", () => {
    const r = createRng(31337);
    for (let i = 0; i < 10_000; i++) {
      const v = r.int(-3, 7);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThan(7);
    }
  });

  it("int(n, n+1) is always n", () => {
    const r = createRng(8);
    for (let i = 0; i < 50; i++) expect(r.int(4, 5)).toBe(4);
  });

  it("range with min === max always returns min", () => {
    const r = createRng(2);
    for (let i = 0; i < 20; i++) expect(r.range(3, 3)).toBe(3);
  });

  it("range with an inverted span stays within (max, min]", () => {
    const r = createRng(3);
    for (let i = 0; i < 200; i++) {
      const v = r.range(10, 0);
      expect(v).toBeLessThanOrEqual(10);
      expect(v).toBeGreaterThan(0);
    }
  });
});
