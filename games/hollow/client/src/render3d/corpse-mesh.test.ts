import { describe, it, expect } from "vitest";
import { boundsOf } from "@engine/core/render3d";
import { buildCorpseMesh, corpseTint } from "./corpse-mesh";

describe("buildCorpseMesh", () => {
  it("uses only the corpseShroud material", () => {
    const materials = new Set(buildCorpseMesh().tris.map((t) => t.material));
    expect(materials.has("corpseShroud")).toBe(true);
    expect(materials.size).toBe(1);
  });

  it("has non-degenerate bounds in every axis (an actual visible structure)", () => {
    const bounds = boundsOf(buildCorpseMesh());
    expect(bounds.max[0] - bounds.min[0]).toBeGreaterThan(0);
    expect(bounds.max[1] - bounds.min[1]).toBeGreaterThan(0);
    expect(bounds.max[2] - bounds.min[2]).toBeGreaterThan(0);
  });

  it("is low/prone — flatter (z extent) than it is long (x extent)", () => {
    const bounds = boundsOf(buildCorpseMesh());
    const xExtent = bounds.max[0] - bounds.min[0];
    const zExtent = bounds.max[2] - bounds.min[2];
    expect(zExtent).toBeLessThan(xExtent);
  });

  it("rests at/above the local origin plane (no basement clipping when placed on the ground)", () => {
    const bounds = boundsOf(buildCorpseMesh());
    expect(bounds.min[2]).toBeGreaterThanOrEqual(0);
  });

  it("is deterministic — repeated builds produce the identical geometry", () => {
    const a = buildCorpseMesh();
    const b = buildCorpseMesh();
    expect(a.tris.length).toBe(b.tris.length);
    expect(a.positions).toEqual(b.positions);
    expect(a.tris).toEqual(b.tris);
  });
});

describe("corpseTint", () => {
  it("is the neutral white tint for a fresh (non-rotting) corpse", () => {
    expect(corpseTint(false)).toEqual([1, 1, 1, 1]);
  });

  it("darkens toward sickly green for a rotting corpse", () => {
    const [r, g, b, a] = corpseTint(true);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
    expect(a).toBe(1);
  });

  it("is visibly distinct from the non-rotting tint", () => {
    expect(corpseTint(true)).not.toEqual(corpseTint(false));
  });

  it("is pure — repeated calls return the same result", () => {
    expect(corpseTint(true)).toEqual(corpseTint(true));
  });
});
