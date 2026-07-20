import { describe, it, expect } from "vitest";
import { rectsOverlap, footprintRect, findFreePlacement, HOME_MARGIN, type Rect } from "./home-placement";

describe("rectsOverlap", () => {
  it("detects overlapping rects", () => {
    const a: Rect = { minX: 0, minY: 0, maxX: 4, maxY: 4 };
    const b: Rect = { minX: 2, minY: 2, maxX: 6, maxY: 6 };
    expect(rectsOverlap(a, b)).toBe(true);
  });

  it("treats separated rects as non-overlapping", () => {
    const a: Rect = { minX: 0, minY: 0, maxX: 4, maxY: 4 };
    const b: Rect = { minX: 5, minY: 0, maxX: 9, maxY: 4 };
    expect(rectsOverlap(a, b)).toBe(false);
  });

  it("treats edge-touching rects as non-overlapping", () => {
    const a: Rect = { minX: 0, minY: 0, maxX: 4, maxY: 4 };
    const b: Rect = { minX: 4, minY: 0, maxX: 8, maxY: 4 };
    expect(rectsOverlap(a, b)).toBe(false);
  });
});

describe("footprintRect", () => {
  it("is corner-anchored (spans [x, x+w] x [y, y+d]) with no margin", () => {
    expect(footprintRect(10, 20, 3, 2)).toEqual({ minX: 10, minY: 20, maxX: 13, maxY: 22 });
  });

  it("inflates by the margin on every side", () => {
    expect(footprintRect(10, 20, 3, 2, 1)).toEqual({ minX: 9, minY: 19, maxX: 14, maxY: 23 });
  });
});

describe("findFreePlacement", () => {
  it("returns the desired position when nothing is placed yet", () => {
    const pos = findFreePlacement({ x: 30, y: 30 }, 4, 3, HOME_MARGIN, []);
    expect(pos).toEqual({ x: 30, y: 30 });
  });

  it("moves a home off an occupied anchor so its hitbox clears the placed one", () => {
    const w = 4;
    const d = 3;
    const placed: Rect[] = [footprintRect(30, 30, w, d, HOME_MARGIN)];
    const pos = findFreePlacement({ x: 30, y: 30 }, w, d, HOME_MARGIN, placed);
    // It must not overlap the occupied hitbox.
    expect(rectsOverlap(footprintRect(pos.x, pos.y, w, d, HOME_MARGIN), placed[0]!)).toBe(false);
    // And it should have actually moved.
    expect(pos.x === 30 && pos.y === 30).toBe(false);
  });

  it("places a run of homes at the same anchor with zero mutual overlap", () => {
    const w = 5;
    const d = 4;
    const placed: Rect[] = [];
    for (let i = 0; i < 8; i++) {
      const pos = findFreePlacement({ x: 32, y: 32 }, w, d, HOME_MARGIN, placed);
      const rect = footprintRect(pos.x, pos.y, w, d, HOME_MARGIN);
      for (const r of placed) expect(rectsOverlap(r, rect)).toBe(false);
      placed.push(rect);
    }
    expect(placed).toHaveLength(8);
  });

  it("is deterministic for identical inputs", () => {
    const placed: Rect[] = [footprintRect(30, 30, 5, 4, HOME_MARGIN)];
    const a = findFreePlacement({ x: 30, y: 30 }, 5, 4, HOME_MARGIN, placed);
    const b = findFreePlacement({ x: 30, y: 30 }, 5, 4, HOME_MARGIN, placed);
    expect(a).toEqual(b);
  });
});
