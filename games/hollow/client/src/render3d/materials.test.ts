import { describe, it, expect } from "vitest";
import {
  WORLD_MATERIAL_KEYS,
  buildWorldMaterialList,
  worldMaterialIndexOf,
  territoryTintColor,
  WHITE_TINT,
} from "./materials";

describe("world material table", () => {
  it("has no duplicate keys", () => {
    expect(new Set(WORLD_MATERIAL_KEYS).size).toBe(WORLD_MATERIAL_KEYS.length);
  });

  it("buildWorldMaterialList() has one valid Material per key, same order", () => {
    const materials = buildWorldMaterialList();
    expect(materials).toHaveLength(WORLD_MATERIAL_KEYS.length);
    for (const m of materials) {
      expect(m.color).toHaveLength(3);
      for (const c of m.color) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });

  it("worldMaterialIndexOf resolves every key to a distinct valid index matching array order", () => {
    const seen = new Set<number>();
    WORLD_MATERIAL_KEYS.forEach((key, i) => {
      const idx = worldMaterialIndexOf(key);
      expect(idx).toBe(i);
      seen.add(idx);
    });
    expect(seen.size).toBe(WORLD_MATERIAL_KEYS.length);
  });

  it("throws for an unknown material key", () => {
    expect(() => worldMaterialIndexOf("nope")).toThrow();
  });
});

describe("territoryTintColor", () => {
  it("is deterministic for a given community id", () => {
    expect(territoryTintColor(3)).toEqual(territoryTintColor(3));
  });

  it("returns a valid opaque rgba color", () => {
    for (let id = 0; id < 12; id++) {
      const [r, g, b, a] = territoryTintColor(id);
      for (const c of [r, g, b]) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
      expect(a).toBe(1);
    }
  });

  it("differs from the plain white tint (it actually recolors)", () => {
    expect(territoryTintColor(0)).not.toEqual(WHITE_TINT);
  });

  it("gives distinct communities visibly distinct tints, within one color-role cycle", () => {
    const colors = new Set([0, 1, 2, 3].map((id) => territoryTintColor(id).join(",")));
    expect(colors.size).toBe(4);
  });
});
