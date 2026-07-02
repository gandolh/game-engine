/**
 * art-06 showcase — pure-layout tests (no GPU / no browser). The headline
 * guarantee: the "pixels don't overlap" claim is STRUCTURAL — no two placed
 * sprite AABBs intersect — so a screenshot can't have silently-overlapping
 * assets. Also asserts the set covers every building type with a sprite and that
 * the layout is deterministic.
 */
import { describe, it, expect } from "vitest";
import {
  showcaseLayout,
  showcaseBuildingTypes,
  firstOverlap,
  aabbsOverlap,
} from "./showcase";
import { BUILDING_SPRITE_TYPES } from "./sprites/recipes";

describe("showcase layout", () => {
  it("covers exactly the building types that have a sprite", () => {
    expect(showcaseBuildingTypes().sort()).toEqual([...BUILDING_SPRITE_TYPES].sort());
    const layout = showcaseLayout();
    expect(layout.items.length).toBe(BUILDING_SPRITE_TYPES.size);
    expect(new Set(layout.items.map((i) => i.label)).size).toBe(layout.items.length);
  });

  it("no two sprite AABBs overlap (pixels can't collide)", () => {
    const overlap = firstOverlap(showcaseLayout());
    expect(
      overlap,
      overlap ? `overlap: ${overlap[0].label} vs ${overlap[1].label}` : "",
    ).toBeNull();
  });

  it("no overlap in the all-burning variant either (same footprints)", () => {
    expect(firstOverlap(showcaseLayout(true))).toBeNull();
  });

  it("is deterministic — same layout every call", () => {
    const a = showcaseLayout();
    const b = showcaseLayout();
    expect(a.pitchTiles).toBe(b.pitchTiles);
    expect(a.items.map((i) => [i.label, i.aabb])).toEqual(b.items.map((i) => [i.label, i.aabb]));
  });

  it("aabbsOverlap: intersecting yes, edge-touching no, disjoint no", () => {
    const base = { x: 0, y: 0, width: 10, height: 10 };
    expect(aabbsOverlap(base, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);  // overlap
    expect(aabbsOverlap(base, { x: 10, y: 0, width: 10, height: 10 })).toBe(false); // edge touch
    expect(aabbsOverlap(base, { x: 20, y: 20, width: 5, height: 5 })).toBe(false);  // disjoint
  });

  it("every placed building's AABB has positive area", () => {
    for (const it of showcaseLayout().items) {
      expect(it.aabb.width, it.label).toBeGreaterThan(0);
      expect(it.aabb.height, it.label).toBeGreaterThan(0);
    }
  });
});
