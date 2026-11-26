import { describe, it, expect } from "vitest";
import {
  WORLD_MATERIAL_KEYS,
  TERRITORY_MATERIAL_KEYS,
  buildWorldMaterialList,
  worldMaterialIndexOf,
  territoryMaterialKey,
  territoryTintColor,
  WHITE_TINT,
} from "./materials";
import { COMMUNITY_COLOR_ROLES } from "./community-color";

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

describe("territory materials", () => {
  it("are one per community colour slot, after the other world keys", () => {
    expect(TERRITORY_MATERIAL_KEYS).toHaveLength(COMMUNITY_COLOR_ROLES.length);
    expect(WORLD_MATERIAL_KEYS.slice(-TERRITORY_MATERIAL_KEYS.length)).toEqual(TERRITORY_MATERIAL_KEYS);
  });

  it("give community ids 0 to 16 the rgb of territoryTintColor", () => {
    const materials = buildWorldMaterialList();
    for (let id = 0; id <= 16; id++) {
      const material = materials[worldMaterialIndexOf(territoryMaterialKey(id))];
      const [r, g, b] = territoryTintColor(id);
      expect(material?.color).toEqual([r, g, b]);
      expect(material?.emissive).toBeFalsy();
    }
  });
});
