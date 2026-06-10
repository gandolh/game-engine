// Tests cover only the atlas-map path (addAtlas/setAtlas + error throws before any canvas call).
// Canvas rendering itself (drawSprite, endFrame) requires a real browser context.
import { describe, it, expect } from "vitest";
import type { LoadedAtlasImage } from "../assets/loader";
import type { AtlasManifest } from "../assets/atlas-format";

function makeAtlasStub(id: string, frames: Record<string, { x: number; y: number; w: number; h: number }>): LoadedAtlasImage {
  const manifest: AtlasManifest = {
    id,
    imageUrl: `/atlas/${id}.png`,
    width: 128,
    height: 128,
    frames,
  };
  return {
    manifest,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test stub, no real ImageBitmap
    bitmap: {} as any,
    frameRect(name: string) {
      const f = manifest.frames[name];
      if (!f) throw new Error(`Atlas frame not found: ${name} (atlas ${id})`);
      return f;
    },
  };
}

describe("Canvas2dRenderer atlas map", () => {
  // Dynamic import avoids top-level DOM requirement in node env.
  let Canvas2dRenderer: typeof import("./canvas2d").Canvas2dRenderer;
  let Camera2D: typeof import("./camera").Camera2D;

  function makeCanvasStub() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test stub
    return {
      getContext: () => ({
        imageSmoothingEnabled: false,
        createPattern: () => null,
      }),
      clientWidth: 640,
      clientHeight: 480,
      width: 640,
      height: 480,
    } as unknown as HTMLCanvasElement;
  }

  function makeCameraStub() {
    return {
      worldUnitsX: 640,
      worldUnitsY: 480,
      centerX: 320,
      centerY: 240,
      setCenter: () => {},
      setZoom: () => {},
    } as unknown as import("./camera").Camera2D;
  }

  it("addAtlas registers a sheet without throwing", async () => {
    const { Canvas2dRenderer: Renderer } = await import("./canvas2d");
    const renderer = new Renderer(makeCanvasStub(), makeCameraStub());
    const atlas = makeAtlasStub("terrain", { "tile/grass": { x: 1, y: 1, w: 16, h: 16 } });
    expect(() => renderer.addAtlas(atlas)).not.toThrow();
  });

  it("setAtlas (back-compat) delegates to addAtlas", async () => {
    const { Canvas2dRenderer: Renderer } = await import("./canvas2d");
    const renderer = new Renderer(makeCanvasStub(), makeCameraStub());
    const atlas = makeAtlasStub("terrain", { "tile/grass": { x: 1, y: 1, w: 16, h: 16 } });
    expect(() => renderer.setAtlas(atlas)).not.toThrow();
  });

  it("addAtlas replaces a previously registered sheet with the same id", async () => {
    const { Canvas2dRenderer: Renderer } = await import("./canvas2d");
    const renderer = new Renderer(makeCanvasStub(), makeCameraStub());
    const atlas1 = makeAtlasStub("terrain", { "tile/grass": { x: 1, y: 1, w: 16, h: 16 } });
    const atlas2 = makeAtlasStub("terrain", { "tile/ocean": { x: 18, y: 1, w: 16, h: 16 } });
    renderer.addAtlas(atlas1);
    expect(() => renderer.addAtlas(atlas2)).not.toThrow();
  });

  it("bakeWaterPattern throws when atlasId is unknown", async () => {
    const { Canvas2dRenderer: Renderer } = await import("./canvas2d");
    const renderer = new Renderer(makeCanvasStub(), makeCameraStub());
    renderer.addAtlas(makeAtlasStub("terrain", { "tile/ocean": { x: 1, y: 1, w: 16, h: 16 } }));
    expect(() => renderer.bakeWaterPattern("tile/ocean", "buildings", 16)).toThrow('atlas "buildings" not found');
  });

  it("bakeWaterPattern throws when no atlases are registered", async () => {
    const { Canvas2dRenderer: Renderer } = await import("./canvas2d");
    const renderer = new Renderer(makeCanvasStub(), makeCameraStub());
    expect(() => renderer.bakeWaterPattern("tile/ocean", "terrain", 16)).toThrow("addAtlas must be called first");
  });

  it("bakeStaticLayer throws when no atlases are registered", async () => {
    const { Canvas2dRenderer: Renderer } = await import("./canvas2d");
    const renderer = new Renderer(makeCanvasStub(), makeCameraStub());
    expect(() => renderer.bakeStaticLayer([], 640, 480)).toThrow("addAtlas must be called first");
  });
});
