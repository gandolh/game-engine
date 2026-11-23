import { describe, expect, it } from "vitest";
import { MAX_PAGE_SIDE, packPages } from "./pages";

describe("packPages", () => {
  it("packs Farm's six sheets into one 512x1024 page, in three columns", () => {
    const farm = [
      { id: "characters", w: 128, h: 512 },
      { id: "buildings", w: 128, h: 1024 },
      { id: "terrain", w: 128, h: 128 },
      { id: "crops", w: 128, h: 128 },
      { id: "props", w: 128, h: 512 },
      { id: "items-ui", w: 128, h: 128 },
    ];
    expect(packPages(farm)).toEqual([
      {
        width: 512,
        height: 1024,
        placements: [
          { id: "buildings", x: 0, y: 0 },
          { id: "characters", x: 128, y: 0 },
          { id: "props", x: 128, y: 512 },
          { id: "terrain", x: 256, y: 0 },
          { id: "crops", x: 256, y: 128 },
          { id: "items-ui", x: 256, y: 256 },
        ],
      },
    ]);
  });

  it("opens a second page when the blocks don't fit one", () => {
    const big = [1, 2, 3, 4, 5].map((n) => ({ id: `s${n}`, w: 1024, h: 1024 }));
    const pages = packPages(big);
    expect(pages.map((p) => [p.width, p.height, p.placements.length])).toEqual([
      [2048, 2048, 4],
      [1024, 1024, 1],
    ]);
    expect(pages.flatMap((p) => p.placements.map((q) => q.id)).sort()).toEqual(["s1", "s2", "s3", "s4", "s5"]);
  });

  it("refuses a sheet past the page limit", () => {
    expect(() => packPages([{ id: "huge", w: MAX_PAGE_SIDE * 2, h: 16 }])).toThrow(/huge.*page limit/);
  });

  it("keeps a lone sheet at its own size", () => {
    expect(packPages([{ id: "only", w: 128, h: 8 }])).toEqual([
      { width: 128, height: 8, placements: [{ id: "only", x: 0, y: 0 }] },
    ]);
  });
});
