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
      // Advance N steps
      for (let i = 0; i < 5; i++) r1.nextU32();
      // Take snapshot
      const snap = r1.snapshot();
      // Collect M outputs from r1
      const seqA = Array.from({ length: 8 }, () => r1.nextU32());
      // Restore from snapshot and collect M outputs from r2
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
