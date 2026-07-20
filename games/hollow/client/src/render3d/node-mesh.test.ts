import { describe, it, expect } from "vitest";
import { boundsOf } from "@engine/core/render3d";
import { resourceNodeFullness, nodeMeshFor } from "./node-mesh";

describe("resourceNodeFullness", () => {
  it("computes stock/maxStock", () => {
    expect(resourceNodeFullness(50, 100)).toBe(0.5);
    expect(resourceNodeFullness(100, 100)).toBe(1);
    expect(resourceNodeFullness(0, 100)).toBe(0);
  });

  it("clamps into [0, 1] for out-of-range input", () => {
    expect(resourceNodeFullness(150, 100)).toBe(1);
    expect(resourceNodeFullness(-10, 100)).toBe(0);
  });

  it("defensively returns 0 for a degenerate maxStock", () => {
    expect(resourceNodeFullness(10, 0)).toBe(0);
    expect(resourceNodeFullness(10, -5)).toBe(0);
  });
});

describe("nodeMeshFor", () => {
  it("builds a visibly distinct mesh per kind (different material keys)", () => {
    const food = nodeMeshFor("food", 100, 100);
    const material = nodeMeshFor("material", 100, 100);
    const foodMaterials = new Set(food.tris.map((t) => t.material));
    const materialMaterials = new Set(material.tris.map((t) => t.material));
    for (const m of foodMaterials) expect(materialMaterials.has(m)).toBe(false);
  });

  it("scales monotonically with fullness (fuller node -> bigger bounds)", () => {
    const empty = boundsOf(nodeMeshFor("food", 5, 100));
    const half = boundsOf(nodeMeshFor("food", 50, 100));
    const full = boundsOf(nodeMeshFor("food", 100, 100));
    const extent = (b: { min: readonly [number, number, number]; max: readonly [number, number, number] }) =>
      b.max[0] - b.min[0];
    expect(extent(half)).toBeGreaterThan(extent(empty));
    expect(extent(full)).toBeGreaterThan(extent(half));
  });

  it("never fully vanishes even at zero stock", () => {
    const bounds = boundsOf(nodeMeshFor("material", 0, 100));
    expect(bounds.max[0] - bounds.min[0]).toBeGreaterThan(0);
  });

  it("falls back to the material/rock mesh for an unrecognized kind", () => {
    const material = nodeMeshFor("material", 100, 100);
    const unknown = nodeMeshFor("mystery", 100, 100);
    expect(unknown.tris.map((t) => t.material)).toEqual(material.tris.map((t) => t.material));
  });
});
