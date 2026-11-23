import { describe, it, expect } from "vitest";
import { SpatialHash } from "./spatial-hash";
import { circlesOverlap, aabbOverlap, separateCircles, type SeparateBody } from "./separate";

describe("circlesOverlap", () => {
  it("true when circles intersect", () => {
    expect(circlesOverlap(0, 0, 1, 1, 0, 1)).toBe(true);
  });

  it("true when circles exactly touch", () => {
    expect(circlesOverlap(0, 0, 1, 2, 0, 1)).toBe(true);
  });

  it("false when circles are far apart", () => {
    expect(circlesOverlap(0, 0, 1, 10, 0, 1)).toBe(false);
  });
});

describe("aabbOverlap", () => {
  it("true when boxes intersect", () => {
    const a = { min: [0, 0, 0] as const, max: [1, 1, 1] as const };
    const b = { min: [0.5, 0.5, 0.5] as const, max: [2, 2, 2] as const };
    expect(aabbOverlap(a, b)).toBe(true);
  });

  it("false when separated on a single axis", () => {
    const a = { min: [0, 0, 0] as const, max: [1, 1, 1] as const };
    const b = { min: [5, 0, 0] as const, max: [6, 1, 1] as const };
    expect(aabbOverlap(a, b)).toBe(false);
  });
});

describe("separateCircles", () => {
  it("pushes an overlapping pair apart until non-overlapping", () => {
    const bodies: SeparateBody[] = [
      { id: 1, x: 0, y: 0, radius: 1 },
      { id: 2, x: 0.5, y: 0, radius: 1 },
    ];
    const out = separateCircles(bodies);
    const a = out.get(1)!;
    const b = out.get(2)!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    expect(dist).toBeGreaterThanOrEqual(2 - 1e-6);
  });

  it("leaves non-overlapping bodies ~unchanged", () => {
    const bodies: SeparateBody[] = [
      { id: 1, x: 0, y: 0, radius: 0.4 },
      { id: 2, x: 10, y: 10, radius: 0.4 },
    ];
    const out = separateCircles(bodies);
    expect(out.get(1)).toEqual({ x: 0, y: 0 });
    expect(out.get(2)).toEqual({ x: 10, y: 10 });
  });

  it("does not mutate the input array", () => {
    const bodies: SeparateBody[] = [
      { id: 1, x: 0, y: 0, radius: 1 },
      { id: 2, x: 0.1, y: 0, radius: 1 },
    ];
    const snapshot = bodies.map((b) => ({ ...b }));
    separateCircles(bodies);
    expect(bodies).toEqual(snapshot);
  });

  it("fans out an identical-position pair deterministically (non-zero separation)", () => {
    const bodies: SeparateBody[] = [
      { id: 3, x: 5, y: 5, radius: 0.5 },
      { id: 7, x: 5, y: 5, radius: 0.5 },
    ];
    const out = separateCircles(bodies);
    const a = out.get(3)!;
    const b = out.get(7)!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    expect(dist).toBeGreaterThan(0.9); // fanned out toward touching (radius sum = 1)
  });

  it("identical-position fan-out is reproducible across repeat runs", () => {
    const bodies: SeparateBody[] = [
      { id: 3, x: 5, y: 5, radius: 0.5 },
      { id: 7, x: 5, y: 5, radius: 0.5 },
    ];
    const run1 = separateCircles(bodies);
    const run2 = separateCircles(bodies);
    expect(run1.get(3)).toEqual(run2.get(3));
    expect(run1.get(7)).toEqual(run2.get(7));
  });

  it("result is independent of the caller's input array order", () => {
    const bodies: SeparateBody[] = [
      { id: 1, x: 0, y: 0, radius: 0.5 },
      { id: 2, x: 0.3, y: 0, radius: 0.5 },
      { id: 3, x: 0, y: 0, radius: 0.5 }, // coincides with id 1 too
      { id: 4, x: 0.3, y: 0.3, radius: 0.5 },
    ];
    const forward = separateCircles(bodies);
    const shuffled = separateCircles([...bodies].reverse());
    for (const b of bodies) {
      expect(shuffled.get(b.id)).toEqual(forward.get(b.id));
    }
  });

  it("handles more than 2 mutually-overlapping bodies without throwing and reduces overlap", () => {
    const bodies: SeparateBody[] = [
      { id: 1, x: 0, y: 0, radius: 1 },
      { id: 2, x: 0.5, y: 0, radius: 1 },
      { id: 3, x: 0, y: 0.5, radius: 1 },
    ];
    const out = separateCircles(bodies, { iterations: 8 });
    const ids = [1, 2, 3];
    for (const i of ids) {
      for (const j of ids) {
        if (i >= j) continue;
        const a = out.get(i)!;
        const b = out.get(j)!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // Should be closer to resolved (>= radius sum - small slack) than
        // the original heavily-overlapping configuration.
        expect(dist).toBeGreaterThan(1.0);
      }
    }
  });
});

/** The solver as it was before brief 24: a new hash on every pass and `queryRadius` for the neighbours. */
function referenceSeparate(bodies: readonly SeparateBody[], iterations = 4): Map<number, { x: number; y: number }> {
  const sorted = [...bodies].sort((a, b) => a.id - b.id);
  const pos = new Map<number, { x: number; y: number }>();
  const radiusById = new Map<number, number>();
  let maxRadius = 0;
  for (const b of sorted) {
    pos.set(b.id, { x: b.x, y: b.y });
    radiusById.set(b.id, b.radius);
    if (b.radius > maxRadius) maxRadius = b.radius;
  }
  if (sorted.length < 2) return pos;
  const cellSize = Math.max(maxRadius * 2, 1e-6);
  for (let iter = 0; iter < iterations; iter++) {
    const hash = new SpatialHash(cellSize);
    for (const b of sorted) {
      const p = pos.get(b.id) as { x: number; y: number };
      hash.insert(b.id, p.x, p.y);
    }
    for (const a of sorted) {
      const ap = pos.get(a.id) as { x: number; y: number };
      const ar = radiusById.get(a.id) as number;
      for (const bId of hash.queryRadius(ap.x, ap.y, ar + maxRadius)) {
        if (bId <= a.id) continue;
        const bp = pos.get(bId) as { x: number; y: number };
        const br = radiusById.get(bId) as number;
        const desired = ar + br;
        const dx = bp.x - ap.x;
        const dy = bp.y - ap.y;
        const distSq = dx * dx + dy * dy;
        if (distSq >= desired * desired) continue;
        const dist = Math.sqrt(distSq);
        let nx: number;
        let ny: number;
        if (dist < 1e-9) {
          const angle = (a.id * (Math.PI * (3 - Math.sqrt(5)))) % (Math.PI * 2);
          nx = Math.cos(angle);
          ny = Math.sin(angle);
        } else {
          nx = dx / dist;
          ny = dy / dist;
        }
        const push = (desired - dist) / 2;
        ap.x -= nx * push;
        ap.y -= ny * push;
        bp.x += nx * push;
        bp.y += ny * push;
      }
    }
  }
  return pos;
}

describe("separateCircles against the pre-brief-24 solver", () => {
  it("gives identical positions on seeded crowds, including coincident bodies and negative coordinates", () => {
    for (const seed of [1, 7, 42]) {
      let state = seed;
      const rnd = (): number => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 2 ** 32;
      };
      const bodies: SeparateBody[] = [];
      for (let i = 0; i < 120; i++) {
        // A tight 12x12 area with a few exact duplicates and some negative coordinates.
        const x = i % 15 === 0 && i > 0 ? (bodies[i - 1] as SeparateBody).x : Math.floor(rnd() * 24) / 2 - 3;
        const y = i % 15 === 0 && i > 0 ? (bodies[i - 1] as SeparateBody).y : Math.floor(rnd() * 24) / 2 - 3;
        bodies.push({ id: 1000 - i * 3, x, y, radius: 0.5 });
      }
      const fresh = separateCircles(bodies);
      const reference = referenceSeparate(bodies);
      expect([...fresh.entries()]).toEqual([...reference.entries()]);
    }
  });
});
