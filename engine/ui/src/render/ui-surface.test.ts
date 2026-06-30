import { describe, expect, it } from "vitest";
import { Camera2D, Canvas2dRenderer, EDG } from "@engine/core/render";
import type { LoadedAtlasImage } from "@engine/core/assets";
import { UISurface } from "./ui-surface";

/**
 * Records every fillRect issued at the prevailing transform so the test can assert a
 * UI quad lands at the expected SCREEN pixel rect (not a camera-transformed one).
 */
interface RectCall {
  x: number;
  y: number;
  w: number;
  h: number;
  fillStyle: string;
  alpha: number;
  // The transform matrix in effect when this rect was filled.
  m: [number, number, number, number, number, number];
}

function makeStubContext(rects: RectCall[]): CanvasRenderingContext2D {
  let m: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
  const ctx = {
    imageSmoothingEnabled: false,
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillStyle: "#000000",
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
      m = [a, b, c, d, e, f];
    },
    fillRect(x: number, y: number, w: number, h: number): void {
      rects.push({ x, y, w, h, fillStyle: String(ctx.fillStyle), alpha: ctx.globalAlpha, m: [...m] });
    },
    // Unused-but-called surface from the world render path (all queues are empty).
    drawImage(): void {},
    beginPath(): void {},
    ellipse(): void {},
    fill(): void {},
    createPattern(): null { return null; },
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

function makeStubCanvas(ctx: CanvasRenderingContext2D): HTMLCanvasElement {
  return {
    width: 800,
    height: 600,
    clientWidth: 800,
    clientHeight: 600,
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement;
}

// A renderer needs at least one atlas registered or endFrame early-returns. This stub
// atlas is never sampled by a solid-colour UI quad.
function stubAtlas(): LoadedAtlasImage {
  return {
    manifest: { id: "ui", imageUrl: "", frames: {}, image: { width: 1, height: 1 } } as never,
    bitmap: {} as ImageBitmap,
    frameRect: () => ({ x: 0, y: 0, w: 1, h: 1 }),
  };
}

describe("UISurface screen-space draw (Canvas2D)", () => {
  it("draws a solid UI quad at its screen-pixel rect, unaffected by the camera", () => {
    const rects: RectCall[] = [];
    const ctx = makeStubContext(rects);
    const canvas = makeStubCanvas(ctx);

    // dpr in jsdom is undefined → drawUIQuad uses dpr = 1.
    // A camera panned far from the origin and zoomed: world transform would move any
    // camera-transformed draw, but the UI quad must stay put in screen pixels.
    const camera = new Camera2D({ worldUnitsX: 800, worldUnitsY: 600, centerX: 5000, centerY: 5000 });

    const renderer = new Canvas2dRenderer(canvas, camera);
    renderer.addAtlas(stubAtlas());

    const surface = new UISurface(renderer);

    renderer.beginFrame();
    surface.begin();
    surface.rect(40, 24, 120, 32, EDG.black, 0.5);
    surface.end();
    renderer.endFrame();

    // Find the UI quad among recorded fillRects: it is the one at our exact pixel rect.
    const ui = rects.find((r) => r.w === 120 && r.h === 32);
    expect(ui).toBeDefined();
    expect(ui!.x).toBe(40);
    expect(ui!.y).toBe(24);
    expect(ui!.alpha).toBeCloseTo(0.5);
    expect(ui!.fillStyle).toBe(EDG.black);
    // Drawn under an identity (screen) transform — NOT the world camera transform.
    expect(ui!.m).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it("submits nothing when begin() was not called (layer inert)", () => {
    const rects: RectCall[] = [];
    const ctx = makeStubContext(rects);
    const canvas = makeStubCanvas(ctx);
    const camera = new Camera2D({ worldUnitsX: 800, worldUnitsY: 600, centerX: 0, centerY: 0 });
    const renderer = new Canvas2dRenderer(canvas, camera);
    renderer.addAtlas(stubAtlas());
    const surface = new UISurface(renderer);

    renderer.beginFrame();
    // No begin() — pushes are dropped.
    surface.rect(40, 24, 120, 32, EDG.black);
    renderer.endFrame();

    expect(rects.find((r) => r.w === 120 && r.h === 32)).toBeUndefined();
  });

  it("does not re-draw a prior frame's UI when beginUI is not called again (beginFrame resets)", () => {
    const rects: RectCall[] = [];
    const ctx = makeStubContext(rects);
    const canvas = makeStubCanvas(ctx);
    const camera = new Camera2D({ worldUnitsX: 800, worldUnitsY: 600, centerX: 0, centerY: 0 });
    const renderer = new Canvas2dRenderer(canvas, camera);
    renderer.addAtlas(stubAtlas());
    const surface = new UISurface(renderer);

    // Frame 1: submit a UI quad — it draws.
    renderer.beginFrame();
    surface.begin();
    surface.rect(40, 24, 120, 32, EDG.black);
    surface.end();
    renderer.endFrame();
    expect(rects.find((r) => r.w === 120 && r.h === 32)).toBeDefined();

    // Frame 2: no begin()/submit. beginFrame must reset the UI draw-list so the stale
    // quad is NOT re-drawn forever.
    rects.length = 0;
    renderer.beginFrame();
    renderer.endFrame();
    expect(rects.find((r) => r.w === 120 && r.h === 32)).toBeUndefined();
  });
});
