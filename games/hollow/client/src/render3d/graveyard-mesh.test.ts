import { describe, it, expect } from "vitest";
import { boundsOf } from "@engine/core/render3d";
import { buildGraveyardMesh } from "./graveyard-mesh";

describe("buildGraveyardMesh", () => {
  it("uses both the headstone and fence-post (woodDark) materials", () => {
    const materials = new Set(buildGraveyardMesh().tris.map((t) => t.material));
    expect(materials.has("headstone")).toBe(true);
    expect(materials.has("woodDark")).toBe(true);
  });

  it("has non-degenerate bounds in every axis (an actual visible structure)", () => {
    const bounds = boundsOf(buildGraveyardMesh());
    expect(bounds.max[0] - bounds.min[0]).toBeGreaterThan(0);
    expect(bounds.max[1] - bounds.min[1]).toBeGreaterThan(0);
    expect(bounds.max[2] - bounds.min[2]).toBeGreaterThan(0);
  });

  it("rests at/above the local origin plane (no basement clipping when placed on the ground)", () => {
    const bounds = boundsOf(buildGraveyardMesh());
    expect(bounds.min[2]).toBeGreaterThanOrEqual(0);
  });

  it("is deterministic — repeated builds produce the identical geometry", () => {
    const a = buildGraveyardMesh();
    const b = buildGraveyardMesh();
    expect(a.tris.length).toBe(b.tris.length);
    expect(a.positions).toEqual(b.positions);
    expect(a.tris).toEqual(b.tris);
  });

  it("is centered near the tile's local origin (so translating to a tile center places it correctly)", () => {
    const bounds = boundsOf(buildGraveyardMesh());
    // The fence posts are symmetric around x=0/y=0; the headstone cluster is
    // hand-offset a bit — generous tolerance, just guards against an
    // accidental large one-sided offset (same tolerance hearth-mesh.test.ts
    // uses for its own hand-offset flame cluster).
    expect(Math.abs(bounds.min[0] + bounds.max[0])).toBeLessThan(1);
    expect(Math.abs(bounds.min[1] + bounds.max[1])).toBeLessThan(1);
  });

  it("encloses the headstone cluster within the fence's footprint", () => {
    const bounds = boundsOf(buildGraveyardMesh());
    // The fence posts sit at +/-FENCE_HALF_EXTENT (1.1); the whole structure's
    // footprint should not blow past a bit beyond that (post half-width).
    expect(bounds.max[0]).toBeLessThan(1.3);
    expect(bounds.min[0]).toBeGreaterThan(-1.3);
  });
});
