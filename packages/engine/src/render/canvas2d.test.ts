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

describe("pixelSnap formula", () => {
  /**
   * The pixel-snap formula used in the renderer's sprite draw loop:
   *   snappedWorld = (Math.round(worldCoord * sx + ox) - ox) / sx
   * where sx = canvas.width / worldUnitsX and ox = Math.round(-left * sx).
   * This ensures the sprite center maps to an integer screen pixel.
   */
  function snapWorld(worldCoord: number, sx: number, ox: number): number {
    return (Math.round(worldCoord * sx + ox) - ox) / sx;
  }

  it("a fractional world coord maps to an integer screen position", () => {
    const sx = 2; // 2 screen pixels per world pixel
    const ox = 0; // no camera offset
    const worldCoord = 10.3;
    const snapped = snapWorld(worldCoord, sx, ox);
    const screenPos = snapped * sx + ox;
    expect(Number.isInteger(Math.round(screenPos))).toBe(true);
    // More precisely: the screen position is an exact integer (no fraction)
    expect(screenPos % 1).toBeCloseTo(0, 10);
  });

  it("the raw fractional world coord does NOT map to an integer screen position (test correctness)", () => {
    const sx = 2;
    const ox = 0;
    const worldCoord = 10.3;
    const rawScreenPos = worldCoord * sx + ox; // 20.6 — not integer
    expect(rawScreenPos % 1).not.toBeCloseTo(0, 2);
  });

  it("no-op when world coord is already on a pixel boundary", () => {
    const sx = 2;
    const ox = 0;
    const worldCoord = 10; // exact integer → no change
    const snapped = snapWorld(worldCoord, sx, ox);
    expect(snapped).toBe(worldCoord);
  });

  it("handles non-zero camera origin offset (ox != 0)", () => {
    const sx = 3;
    const left = 5.7;
    const ox = Math.round(-left * sx); // rounded camera offset
    const worldCoord = 12.4;
    const snapped = snapWorld(worldCoord, sx, ox);
    const screenPos = snapped * sx + ox;
    // Screen position must be an integer (within floating-point epsilon)
    expect(screenPos % 1).toBeCloseTo(0, 10);
  });
});

describe("x-ray (occlusion-transparency) pass", () => {
  // A recording 2D context that captures globalAlpha at each drawImage call, so we can detect the
  // extra low-alpha "ghost" re-draw of an occluded sprite. Only the methods endFrame touches.
  function makeRecordingCtx(): { ctx: unknown; drawAlphas: number[] } {
    const drawAlphas: number[] = [];
    const ctx = {
      imageSmoothingEnabled: false,
      globalAlpha: 1,
      globalCompositeOperation: "source-over",
      fillStyle: "#000",
      strokeStyle: "#000",
      lineWidth: 1,
      createPattern: () => null,
      setTransform: () => {},
      save: () => {},
      restore: () => {},
      fillRect: () => {},
      beginPath: () => {},
      ellipse: () => {},
      arc: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      closePath: () => {},
      fill: () => {},
      drawImage(this: { globalAlpha: number }) {
        drawAlphas.push(this.globalAlpha);
      },
    };
    return { ctx, drawAlphas };
  }

  function makeCanvas(ctx: unknown): HTMLCanvasElement {
    return {
      getContext: () => ctx,
      clientWidth: 640, clientHeight: 480, width: 640, height: 480,
    } as unknown as HTMLCanvasElement;
  }

  function makeCamera(): import("./camera").Camera2D {
    return {
      worldUnitsX: 640, worldUnitsY: 480, centerX: 320, centerY: 240, zoom: 1,
      setCenter: () => {}, setZoom: () => {},
    } as unknown as import("./camera").Camera2D;
  }

  function base(partial: Partial<import("./canvas2d/types").Canvas2dSprite>): import("./canvas2d/types").Canvas2dSprite {
    return {
      x: 0, y: 0, width: 16, height: 16, frame: "f", atlasId: "terrain",
      rotation: 0, layer: 50, alpha: 1, ...partial,
    };
  }

  async function setup(ctx: unknown) {
    const { Canvas2dRenderer: Renderer } = await import("./canvas2d");
    const renderer = new Renderer(makeCanvas(ctx), makeCamera());
    // Inline atlas stub — every frame maps to a 16×16 rect.
    renderer.addAtlas({
      manifest: { id: "terrain", imageUrl: "", width: 64, height: 64, frames: {} },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test stub bitmap
      bitmap: {} as any,
      frameRect: () => ({ x: 0, y: 0, w: 16, h: 16 }),
    } as unknown as import("../assets/loader").LoadedAtlasImage);
    return renderer;
  }

  it("re-draws an occludable sprite at low alpha when a taller sprite covers it", async () => {
    const { ctx, drawAlphas } = makeRecordingCtx();
    const renderer = await setup(ctx);
    // Player (occludable) one tile north of a 48px-tall wall whose base is south of it → covered.
    renderer.push(base({ x: 320, y: 220, occludable: true }));
    renderer.push(base({ x: 320, y: 240, height: 48, sortY: 264 }));
    renderer.endFrame();
    // 2 normal draws + 1 ghost re-draw; the ghost is at 0.4 alpha.
    expect(drawAlphas.length).toBe(3);
    expect(drawAlphas).toContain(0.4);
  });

  it("does NOT re-draw when nothing covers the occludable sprite", async () => {
    const { ctx, drawAlphas } = makeRecordingCtx();
    const renderer = await setup(ctx);
    renderer.push(base({ x: 320, y: 220, occludable: true }));
    renderer.push(base({ x: 100, y: 240, height: 48, sortY: 264 })); // far away in x
    renderer.endFrame();
    expect(drawAlphas.length).toBe(2);
    expect(drawAlphas).not.toContain(0.4);
  });

  it("UI-layer sprites (bubbles/arrows) over the player do not trigger a ghost", async () => {
    const { ctx, drawAlphas } = makeRecordingCtx();
    const renderer = await setup(ctx);
    renderer.push(base({ x: 320, y: 220, occludable: true }));
    renderer.push(base({ x: 320, y: 208, layer: 90 })); // meet bubble above the head, overlapping
    renderer.endFrame();
    expect(drawAlphas.length).toBe(2); // no ghost
  });
});
