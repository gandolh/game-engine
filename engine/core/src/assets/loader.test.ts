import { afterEach, describe, expect, it, vi } from "vitest";
import type { AtlasIndex, AtlasManifest } from "./atlas-format";
import { loadAllAtlasSheets, sheetOnPage } from "./loader";

const manifest = (id: string, frames: AtlasManifest["frames"]): AtlasManifest => ({
  id,
  imageUrl: `/atlas/${id}.png`,
  width: 128,
  height: 128,
  frames,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Serves `files` by URL; images come back as blobs whose bitmaps remember their URL. */
function serve(files: Record<string, unknown>): string[] {
  const fetched: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    fetched.push(url);
    const body = files[url];
    if (body === undefined) return { ok: false, status: 404 };
    return {
      ok: true,
      json: async () => body,
      blob: async () => ({ url }),
    };
  });
  vi.stubGlobal("createImageBitmap", async (blob: { url: string }) => ({ fromUrl: blob.url }));
  return fetched;
}

describe("sheetOnPage", () => {
  it("moves every frame to the sheet's place on the page and takes the page's size", () => {
    const page = { id: "page-0", imageUrl: "/atlas/page-0.png", width: 512, height: 1024 };
    const bitmap = {} as unknown as ImageBitmap;
    const sheet = sheetOnPage(
      manifest("crops", { seed: { x: 1, y: 1, w: 16, h: 16 } }),
      page,
      { page: "page-0", x: 256, y: 128 },
      bitmap,
    );
    expect(sheet.frameRect("seed")).toEqual({ x: 257, y: 129, w: 16, h: 16 });
    expect([sheet.manifest.width, sheet.manifest.height, sheet.manifest.id]).toEqual([512, 1024, "crops"]);
    expect(sheet.bitmap).toBe(bitmap);
    expect(() => sheet.frameRect("nope")).toThrow(/nope.*crops/);
  });
});

describe("loadAllAtlasSheets", () => {
  it("fetches each page once and puts every sheet on it, when the index has pages", async () => {
    const index: AtlasIndex = {
      sheets: [
        { id: "terrain", imageUrl: "/atlas/terrain.png", manifestUrl: "/atlas/terrain.json" },
        { id: "crops", imageUrl: "/atlas/crops.png", manifestUrl: "/atlas/crops.json" },
      ],
      pages: [{ id: "page-0", imageUrl: "/atlas/page-0.png", width: 256, height: 128 }],
      placements: { terrain: { page: "page-0", x: 0, y: 0 }, crops: { page: "page-0", x: 128, y: 0 } },
    };
    const fetched = serve({
      "/game/atlas/index.json": index,
      "/game/atlas/terrain.json": manifest("terrain", { grass: { x: 1, y: 1, w: 16, h: 16 } }),
      "/game/atlas/crops.json": manifest("crops", { seed: { x: 1, y: 1, w: 16, h: 16 } }),
      "/game/atlas/page-0.png": "png",
    });
    const sheets = await loadAllAtlasSheets("/atlas/index.json", "/game/");
    expect([...sheets.keys()]).toEqual(["terrain", "crops"]);
    expect(sheets.get("terrain")?.bitmap).toBe(sheets.get("crops")?.bitmap);
    expect(sheets.get("crops")?.frameRect("seed")).toEqual({ x: 129, y: 1, w: 16, h: 16 });
    expect(fetched.filter((u) => u.endsWith(".png"))).toEqual(["/game/atlas/page-0.png"]);
  });

  it("fetches each sheet's own image when the index has no pages", async () => {
    const fetched = serve({
      "/atlas/index.json": { sheets: [{ id: "a", imageUrl: "/atlas/a.png", manifestUrl: "/atlas/a.json" }] },
      "/atlas/a.json": manifest("a", { f: { x: 1, y: 1, w: 8, h: 8 } }),
      "/atlas/a.png": "png",
    });
    const sheets = await loadAllAtlasSheets();
    expect(sheets.get("a")?.frameRect("f")).toEqual({ x: 1, y: 1, w: 8, h: 8 });
    expect(fetched).toContain("/atlas/a.png");
  });
});
