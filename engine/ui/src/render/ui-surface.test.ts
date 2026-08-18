import { describe, expect, it } from "vitest";
import { drawUIQuad, EDG } from "@engine/core/render";
import type { RendererLike, UIQuad } from "@engine/core/render";
import type { LoadedAtlasImage } from "@engine/core/assets";
import { UISurface } from "./ui-surface";

/**
 * These tests used to drive a whole `Canvas2dRenderer` end-to-end, because that
 * backend rasterized UI straight onto the canvas it was handed, so a stub canvas was
 * enough. Canvas2D is gone (WebGL2-only as of 2026-08-18), and the surviving backend
 * flushes UI through an `Overlay2D` canvas it creates itself — which jsdom cannot
 * hand a 2D context for.
 *
 * So the coverage is split along the real seam instead of faked around it:
 *   1. `UISurface`'s own contract — which `UIQuad`s it submits, and that it submits
 *      nothing without `begin()` — asserted against a recording renderer double.
 *   2. Screen-pixel placement — asserted by running the captured quads through the
 *      REAL `drawUIQuad`, the same production function every backend's flush calls.
 *
 * Nothing is asserted against re-implemented logic. The renderer-side invariant that
 * `beginFrame` resets the UI draw-list lives with the renderer, in
 * `engine/core/src/render/webgl2/renderer.test.ts`.
 */

interface RectCall {
  x: number;
  y: number;
  w: number;
  h: number;
  fillStyle: string;
  alpha: number;
  /** The transform matrix in effect when this rect was filled. */
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
    drawImage(): void {},
    beginPath(): void {},
    ellipse(): void {},
    fill(): void {},
    createPattern(): null { return null; },
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

/** Never sampled — a solid-colour UI quad carries no atlas frame. */
function stubAtlas(): LoadedAtlasImage {
  return {
    manifest: { id: "ui", imageUrl: "", frames: {}, image: { width: 1, height: 1 } } as never,
    bitmap: {} as ImageBitmap,
    frameRect: () => ({ x: 0, y: 0, w: 1, h: 1 }),
  };
}

/**
 * Records the UI draw-list a `UISurface` submits. Only the four UI-seam methods are
 * real; the cast covers the rest of `RendererLike`, which `UISurface` never touches.
 */
function makeRecordingRenderer(): { renderer: RendererLike; quads: UIQuad[]; active: () => boolean } {
  const quads: UIQuad[] = [];
  let uiActive = false;
  const partial = {
    beginUI(): void { uiActive = true; quads.length = 0; },
    pushUI(quad: UIQuad): void { if (uiActive) quads.push(quad); },
    endUI(): void { uiActive = false; },
  };
  return {
    renderer: partial as unknown as RendererLike,
    quads,
    active: () => uiActive,
  };
}

describe("UISurface screen-space draw", () => {
  it("submits a solid UI quad with the exact screen-pixel rect, colour and alpha it was given", () => {
    const { renderer, quads } = makeRecordingRenderer();
    const surface = new UISurface(renderer);

    surface.begin();
    surface.rect(40, 24, 120, 32, EDG.black, 0.5);
    surface.end();

    expect(quads).toHaveLength(1);
    const q = quads[0]!;
    expect(q.x).toBe(40);
    expect(q.y).toBe(24);
    expect(q.width).toBe(120);
    expect(q.height).toBe(32);
    expect(q.color).toBe(EDG.black);
    expect(q.alpha).toBeCloseTo(0.5);
    // A solid quad must carry no atlas frame, or the flush would try to sample one.
    expect(q.atlasId).toBeUndefined();
    expect(q.frame).toBeUndefined();
  });

  it("lands that quad at its screen-pixel rect under an identity transform (real drawUIQuad)", () => {
    const { renderer, quads } = makeRecordingRenderer();
    const surface = new UISurface(renderer);

    surface.begin();
    surface.rect(40, 24, 120, 32, EDG.black, 0.5);
    surface.end();

    const rects: RectCall[] = [];
    const ctx = makeStubContext(rects);
    const atlases = new Map<string, LoadedAtlasImage>([["ui", stubAtlas()]]);
    // dpr = 1, matching jsdom (where devicePixelRatio is undefined).
    drawUIQuad(ctx, atlases, quads[0]!, 1);

    const ui = rects.find((r) => r.w === 120 && r.h === 32);
    expect(ui).toBeDefined();
    expect(ui!.x).toBe(40);
    expect(ui!.y).toBe(24);
    expect(ui!.alpha).toBeCloseTo(0.5);
    expect(ui!.fillStyle).toBe(EDG.black);
    // Screen space: NOT the world camera transform.
    expect(ui!.m).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it("submits nothing when begin() was not called (layer inert)", () => {
    const { renderer, quads } = makeRecordingRenderer();
    const surface = new UISurface(renderer);

    // No begin() — pushes are dropped rather than queued for a later flush.
    surface.rect(40, 24, 120, 32, EDG.black);

    expect(quads).toHaveLength(0);
  });

  it("clears the previous draw-list on each begin() so stale quads cannot accumulate", () => {
    const { renderer, quads } = makeRecordingRenderer();
    const surface = new UISurface(renderer);

    surface.begin();
    surface.rect(40, 24, 120, 32, EDG.black);
    surface.end();
    expect(quads).toHaveLength(1);

    surface.begin();
    surface.rect(0, 0, 8, 8, EDG.black);
    surface.end();
    expect(quads).toHaveLength(1);
    expect(quads[0]!.width).toBe(8);
  });

  it("closes the layer on end(), so a later stray rect() is dropped", () => {
    const { renderer, quads, active } = makeRecordingRenderer();
    const surface = new UISurface(renderer);

    surface.begin();
    surface.end();
    expect(active()).toBe(false);

    surface.rect(40, 24, 120, 32, EDG.black);
    expect(quads).toHaveLength(0);
  });
});
