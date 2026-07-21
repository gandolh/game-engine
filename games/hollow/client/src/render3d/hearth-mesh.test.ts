import { describe, it, expect } from "vitest";
import { boundsOf } from "@engine/core/render3d";
import { buildHearthMesh } from "./hearth-mesh";

describe("buildHearthMesh", () => {
  it("uses both the stone base and the emissive flame material", () => {
    const materials = new Set(buildHearthMesh().tris.map((t) => t.material));
    expect(materials.has("rock")).toBe(true);
    expect(materials.has("hearthFire")).toBe(true);
  });

  it("has non-degenerate bounds in every axis (an actual visible structure)", () => {
    const bounds = boundsOf(buildHearthMesh());
    expect(bounds.max[0] - bounds.min[0]).toBeGreaterThan(0);
    expect(bounds.max[1] - bounds.min[1]).toBeGreaterThan(0);
    expect(bounds.max[2] - bounds.min[2]).toBeGreaterThan(0);
  });

  it("rests at/above the local origin plane (no basement clipping when placed on the ground)", () => {
    const bounds = boundsOf(buildHearthMesh());
    expect(bounds.min[2]).toBeGreaterThanOrEqual(0);
  });

  it("is deterministic — repeated builds produce the identical geometry", () => {
    const a = buildHearthMesh();
    const b = buildHearthMesh();
    expect(a.tris.length).toBe(b.tris.length);
    expect(a.positions).toEqual(b.positions);
    expect(a.tris).toEqual(b.tris);
  });

  it("is centered near the tile's local origin (so translating to a tile center places it correctly)", () => {
    const bounds = boundsOf(buildHearthMesh());
    // Roughly symmetric around x=0/y=0 (flame cluster is hand-offset a bit,
    // stone base is perfectly centered) — a generous tolerance, just guards
    // against an accidental large one-sided offset.
    expect(Math.abs(bounds.min[0] + bounds.max[0])).toBeLessThan(1);
    expect(Math.abs(bounds.min[1] + bounds.max[1])).toBeLessThan(1);
  });
});
