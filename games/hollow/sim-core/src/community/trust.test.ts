import { describe, it, expect } from "vitest";
import { connectedComponents, density, distributeEvenly, mutualTrust } from "./trust";
import type { RelationshipLedger } from "@engine/core/agent";
import { applyRelationshipDelta } from "@engine/core/agent";

function entity(id: number): { id: number; relationships: RelationshipLedger } {
  return { id, relationships: { byId: new Map() } };
}

describe("mutualTrust", () => {
  it("averages both directed scores, defaulting to neutral when unset", () => {
    const a = entity(1);
    const b = entity(2);
    expect(mutualTrust(a, b)).toBe(0.5); // both unset -> neutral/neutral average
    applyRelationshipDelta(a.relationships, 2, 0.3); // a->b = 0.8
    expect(mutualTrust(a, b)).toBeCloseTo((0.8 + 0.5) / 2);
  });
});

describe("connectedComponents — deterministic BFS", () => {
  it("groups fully-connected ids into one component, sorted", () => {
    const edges = new Set(["1-2", "2-3", "1-3"]);
    const hasEdge = (a: number, b: number): boolean => {
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      return edges.has(`${lo}-${hi}`);
    };
    const components = connectedComponents([3, 1, 2], hasEdge);
    expect(components).toEqual([[1, 2, 3]]);
  });

  it("splits disconnected clusters into separate components sorted by minimum id", () => {
    const hasEdge = (a: number, b: number): boolean => Math.floor(a / 10) === Math.floor(b / 10);
    const components = connectedComponents([21, 1, 22, 2, 11], hasEdge);
    expect(components).toEqual([
      [1, 2],
      [11],
      [21, 22],
    ]);
  });

  it("is a pure function of ids + hasEdge regardless of input array order", () => {
    const hasEdge = (a: number, b: number): boolean => a % 2 === b % 2;
    const a = connectedComponents([5, 3, 1, 4, 2], hasEdge);
    const b = connectedComponents([1, 2, 3, 4, 5], hasEdge);
    const c = connectedComponents([4, 2, 5, 1, 3], hasEdge);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });
});

describe("density", () => {
  it("is 0 for fewer than 2 ids", () => {
    expect(density([], () => true)).toBe(0);
    expect(density([1], () => true)).toBe(0);
  });

  it("computes edges / possible pairs", () => {
    // 3 ids -> 3 possible pairs; only one qualifies.
    const hasEdge = (a: number, b: number): boolean => a === 1 && b === 2;
    expect(density([1, 2, 3], hasEdge)).toBeCloseTo(1 / 3);
  });

  it("is 1 for a fully-connected set", () => {
    expect(density([1, 2, 3, 4], () => true)).toBe(1);
  });
});

describe("distributeEvenly", () => {
  it("splits evenly with no remainder", () => {
    expect(distributeEvenly(10, 5)).toEqual([2, 2, 2, 2, 2]);
  });

  it("gives the remainder to the first entries in the caller's order", () => {
    expect(distributeEvenly(10, 3)).toEqual([4, 3, 3]);
    expect(distributeEvenly(1, 4)).toEqual([1, 0, 0, 0]);
  });

  it("returns an empty array for n <= 0", () => {
    expect(distributeEvenly(10, 0)).toEqual([]);
  });

  it("shares always sum to the total", () => {
    for (const [total, n] of [
      [10, 3],
      [7, 4],
      [100, 6],
      [0, 5],
    ] as const) {
      const shares = distributeEvenly(total, n);
      expect(shares.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });
});
