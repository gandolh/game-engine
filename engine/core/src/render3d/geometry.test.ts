import { describe, expect, it } from "vitest";
import {
  add,
  box,
  boundsOf,
  cone,
  cross,
  cylinder,
  disc,
  gable,
  merge,
  pyramid,
  rotateZ,
  scale,
  sub,
  translate,
} from "./geometry";
import type { Mesh } from "./types";

function assertValidIndices(mesh: Mesh): void {
  for (const t of mesh.tris) {
    expect(t.a).toBeLessThan(mesh.positions.length);
    expect(t.b).toBeLessThan(mesh.positions.length);
    expect(t.c).toBeLessThan(mesh.positions.length);
    expect(t.a).toBeGreaterThanOrEqual(0);
    expect(t.b).toBeGreaterThanOrEqual(0);
    expect(t.c).toBeGreaterThanOrEqual(0);
  }
}

describe("box", () => {
  it("has 8 unique positions and 12 tris", () => {
    const m = box([2, 2, 2], "m");
    expect(m.positions).toHaveLength(8);
    expect(m.tris).toHaveLength(12);
    const unique = new Set(m.positions.map((p) => p.join(",")));
    expect(unique.size).toBe(8);
    assertValidIndices(m);
  });

  it("has an outward normal on the +x face", () => {
    const m = box([2, 2, 2], "m");
    // +x face triangles come from f(1,2,6,5); first tri is (1,2,6).
    const faceTri = m.tris.find((t) => t.a === 1 && t.b === 2 && t.c === 6);
    expect(faceTri).toBeDefined();
    const pa = m.positions[faceTri!.a] as [number, number, number];
    const pb = m.positions[faceTri!.b] as [number, number, number];
    const pc = m.positions[faceTri!.c] as [number, number, number];
    const normal = cross(sub(pb, pa), sub(pc, pa));
    // Center of the box is [1,1,1]; the +x face center is roughly [2,1,1] —
    // the vector from center to face should have a positive dot with normal.
    const center: [number, number, number] = [1, 1, 1];
    const faceCenter = add(add(pa, pb), pc);
    const toFace: [number, number, number] = [
      faceCenter[0] / 3 - center[0],
      faceCenter[1] / 3 - center[1],
      faceCenter[2] / 3 - center[2],
    ];
    const d = normal[0] * toFace[0] + normal[1] * toFace[1] + normal[2] * toFace[2];
    expect(d).toBeGreaterThan(0);
  });
});

describe("boundsOf", () => {
  it("computes bounds of a unit box centered at origin", () => {
    const m = translate(box([1, 1, 1], "m"), [-0.5, -0.5, -0.5]);
    const b = boundsOf(m);
    expect(b.min[0]).toBeCloseTo(-0.5);
    expect(b.min[1]).toBeCloseTo(-0.5);
    expect(b.min[2]).toBeCloseTo(-0.5);
    expect(b.max[0]).toBeCloseTo(0.5);
    expect(b.max[1]).toBeCloseTo(0.5);
    expect(b.max[2]).toBeCloseTo(0.5);
  });

  it("returns degenerate zero bounds for an empty mesh", () => {
    const b = boundsOf({ positions: [], tris: [] });
    expect(b.min).toEqual([0, 0, 0]);
    expect(b.max).toEqual([0, 0, 0]);
  });
});

describe("transforms", () => {
  it("translate moves every position by the given vector", () => {
    const m = box([1, 1, 1], "m");
    const t = translate(m, [5, 6, 7]);
    for (let i = 0; i < m.positions.length; i++) {
      const orig = m.positions[i] as [number, number, number];
      const moved = t.positions[i] as [number, number, number];
      expect(moved[0]).toBeCloseTo(orig[0] + 5);
      expect(moved[1]).toBeCloseTo(orig[1] + 6);
      expect(moved[2]).toBeCloseTo(orig[2] + 7);
    }
  });

  it("scale scales every position componentwise", () => {
    const m = box([1, 1, 1], "m");
    const s = scale(m, [2, 3, 4]);
    for (let i = 0; i < m.positions.length; i++) {
      const orig = m.positions[i] as [number, number, number];
      const scaled = s.positions[i] as [number, number, number];
      expect(scaled[0]).toBeCloseTo(orig[0] * 2);
      expect(scaled[1]).toBeCloseTo(orig[1] * 3);
      expect(scaled[2]).toBeCloseTo(orig[2] * 4);
    }
  });

  it("rotateZ by 90deg maps [1,0,0] to [0,1,0]", () => {
    const m: Mesh = { positions: [[1, 0, 0]], tris: [] };
    const r = rotateZ(m, Math.PI / 2);
    const p = r.positions[0] as [number, number, number];
    expect(p[0]).toBeCloseTo(0, 5);
    expect(p[1]).toBeCloseTo(1, 5);
    expect(p[2]).toBeCloseTo(0, 5);
  });
});

describe("merge", () => {
  it("offsets indices so merged tris point into the concatenated position array", () => {
    const a = box([1, 1, 1], "m");
    const b = box([1, 1, 1], "n");
    const merged = merge(a, b);
    expect(merged.positions).toHaveLength(a.positions.length + b.positions.length);
    // Second mesh's tris must be offset by a.positions.length.
    const secondMeshTris = merged.tris.slice(a.tris.length);
    for (const t of secondMeshTris) {
      expect(t.a).toBeGreaterThanOrEqual(a.positions.length);
      expect(t.material).toBe("n");
    }
    assertValidIndices(merged);
  });
});

describe("other primitives produce valid, non-empty meshes", () => {
  it("cylinder", () => {
    const m = cylinder(1, 2, 8, "m");
    expect(m.positions.length).toBeGreaterThan(0);
    expect(m.tris.length).toBeGreaterThan(0);
    assertValidIndices(m);
  });
  it("cone", () => {
    const m = cone(1, 2, 8, "m");
    expect(m.positions.length).toBeGreaterThan(0);
    expect(m.tris.length).toBeGreaterThan(0);
    assertValidIndices(m);
  });
  it("pyramid", () => {
    const m = pyramid([2, 2], 3, "m");
    expect(m.positions.length).toBeGreaterThan(0);
    expect(m.tris.length).toBeGreaterThan(0);
    assertValidIndices(m);
  });
  it("gable", () => {
    const mx = gable([2, 2, 1], "x", "m");
    const my = gable([2, 2, 1], "y", "m");
    for (const m of [mx, my]) {
      expect(m.positions.length).toBeGreaterThan(0);
      expect(m.tris.length).toBeGreaterThan(0);
      assertValidIndices(m);
    }
  });
  it("disc", () => {
    const m = disc(1, 0.1, 8, "m");
    expect(m.positions.length).toBeGreaterThan(0);
    expect(m.tris.length).toBeGreaterThan(0);
    assertValidIndices(m);
  });
});
