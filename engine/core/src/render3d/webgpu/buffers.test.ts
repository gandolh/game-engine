import { describe, it, expect } from "vitest";
import { box, merge, translate } from "../geometry";
import { identity, translation } from "../mat4";
import {
  FLOATS_PER_INSTANCE,
  FLOATS_PER_MATERIAL,
  instanceAABB,
  materialIndexMap,
  packInstance,
  packInstances,
  packMaterials,
  packMesh,
} from "./buffers";

describe("materialIndexMap", () => {
  it("resolves keys to their position in the ordered list", () => {
    const resolve = materialIndexMap(["grass", "wood", "roof"]);
    expect(resolve("grass")).toBe(0);
    expect(resolve("wood")).toBe(1);
    expect(resolve("roof")).toBe(2);
  });

  it("throws on an unknown key", () => {
    const resolve = materialIndexMap(["grass"]);
    expect(() => resolve("nonexistent")).toThrow(/unknown material key/);
  });

  it("keeps the FIRST index for a duplicate key", () => {
    const resolve = materialIndexMap(["a", "b", "a"]);
    expect(resolve("a")).toBe(0);
  });
});

describe("packMesh", () => {
  it("packs a single-material box: counts, uniform material index, valid indices", () => {
    const mesh = box([2, 2, 2], "a");
    const resolve = materialIndexMap(["a"]);
    const packed = packMesh(mesh, resolve);

    expect(packed.vertexCount).toBe(mesh.positions.length);
    expect(packed.vertices.length).toBe(mesh.positions.length * 4);
    expect(packed.indexCount).toBe(mesh.tris.length * 3);
    expect(packed.indices.length).toBe(mesh.tris.length * 3);

    // Every packed materialIndex is 0 (the only material).
    for (let i = 0; i < packed.vertexCount; i++) {
      expect(packed.vertices[i * 4 + 3]).toBe(0);
    }
    // Every index is in range.
    for (const idx of packed.indices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(packed.vertexCount);
    }
    // Positions round-trip correctly for vertex 0.
    const p0 = mesh.positions[0]!;
    expect(packed.vertices[0]).toBeCloseTo(p0[0]);
    expect(packed.vertices[1]).toBeCloseTo(p0[1]);
    expect(packed.vertices[2]).toBeCloseTo(p0[2]);
  });

  it("assigns the right material index to each disjoint vertex group in a merged two-material mesh", () => {
    const boxA = box([1, 1, 1], "a");
    const boxB = translate(box([1, 1, 1], "b"), [3, 0, 0]);
    const merged = merge(boxA, boxB);
    const resolve = materialIndexMap(["a", "b"]);
    const packed = packMesh(merged, resolve);

    const aVertexCount = boxA.positions.length;
    const bVertexCount = boxB.positions.length;
    expect(packed.vertexCount).toBe(aVertexCount + bVertexCount);

    // First group (boxA's vertices) all material index 0.
    for (let i = 0; i < aVertexCount; i++) {
      expect(packed.vertices[i * 4 + 3]).toBe(0);
    }
    // Second group (boxB's vertices, offset by aVertexCount) all material index 1.
    for (let i = 0; i < bVertexCount; i++) {
      expect(packed.vertices[(aVertexCount + i) * 4 + 3]).toBe(1);
    }
  });
});

describe("packInstance / packInstances", () => {
  it("packs an identity model + tint into 20 floats: model first 16, tint last 4", () => {
    const packed = packInstance(identity(), [1, 0, 0, 1]);
    expect(packed.length).toBe(FLOATS_PER_INSTANCE);
    expect([...packed.slice(0, 16)]).toEqual([...identity()]);
    expect([...packed.slice(16, 20)]).toEqual([1, 0, 0, 1]);
  });

  it("packInstances concatenates rows in order", () => {
    const packed = packInstances([
      { model: identity(), tint: [1, 0, 0, 1] },
      { model: translation([5, 0, 0]), tint: [0, 1, 0, 1] },
    ]);
    expect(packed.length).toBe(2 * FLOATS_PER_INSTANCE);
    expect([...packed.slice(0, 16)]).toEqual([...identity()]);
    expect([...packed.slice(16, 20)]).toEqual([1, 0, 0, 1]);
    expect([...packed.slice(20, 36)]).toEqual([...translation([5, 0, 0])]);
    expect([...packed.slice(36, 40)]).toEqual([0, 1, 0, 1]);
  });
});

describe("packMaterials", () => {
  it("packs color + emissive flag at the std430 4-float stride (no padding)", () => {
    // The stride MUST equal scene3d.wgsl's std430 `{vec3 color, f32 emissive}`
    // (16 bytes = 4 floats). An 8-float padded stride made the shader read
    // odd material indices from the previous entry's zero padding → black.
    expect(FLOATS_PER_MATERIAL).toBe(4);

    const packed = packMaterials([
      { color: [1, 0, 0] },
      { color: [0, 1, 0], emissive: true },
    ]);
    expect(packed.length).toBe(2 * FLOATS_PER_MATERIAL);

    // Material 0: red, not emissive; Material 1: green, emissive — packed
    // back-to-back with nothing between them.
    expect([...packed]).toEqual([1, 0, 0, 0, 0, 1, 0, 1]);
  });
});

describe("instanceAABB", () => {
  it("shifts a box's bounds by the model's translation", () => {
    const mesh = box([2, 2, 2], "a");
    const model = translation([5, 0, 0]);
    const { min, max } = instanceAABB(mesh, model);
    expect(min).toEqual([5, 0, 0]);
    expect(max).toEqual([7, 2, 2]);
  });

  it("is a no-op AABB under the identity transform", () => {
    const mesh = box([2, 3, 4], "a");
    const { min, max } = instanceAABB(mesh, identity());
    expect(min).toEqual([0, 0, 0]);
    expect(max).toEqual([2, 3, 4]);
  });
});
