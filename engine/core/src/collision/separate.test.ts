import { describe, it, expect } from "vitest";
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
