import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LoadedAtlasImage } from "../assets/loader";
import { EDG } from "./palette";
import { drawUIQuad } from "./ui-draw";
import type { UIQuad } from "./renderer";
import type { Ctx2D } from "./canvas2d/types";

/**
 * Tests for the textured-quad tint path that Chunk 2 implements in `drawUIQuad`.
 *
 * The tint mirrors `drawSprite`: build a scratch buffer = source × tint (multiply) masked
 * by the source alpha, then blit. These tests record the canvas operations to assert the
 * composite happened (and that the untinted path stays a plain blit — Chunk-1 behaviour).
 */

interface Op {
  op: string;
  fillStyle?: string;
  gco?: string;
  args?: number[];
  // For drawImage: which image was the source (the atlas bitmap vs the tint buffer).
  src?: string;
}

function makeRecordingCtx(ops: Op[], tag: string): Ctx2D {
  const ctx = {
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillStyle: "#000000",
    clearRect(...a: number[]): void {
      ops.push({ op: "clearRect", args: a });
    },
    fillRect(...a: number[]): void {
      ops.push({ op: "fillRect", fillStyle: String(ctx.fillStyle), gco: ctx.globalCompositeOperation, args: a });
    },
    drawImage(src: unknown, ...a: number[]): void {
      const srcTag = (src as { __tag?: string }).__tag ?? "unknown";
      ops.push({ op: "drawImage", src: srcTag, gco: ctx.globalCompositeOperation, args: a });
    },
  };
  (ctx as unknown as { __tag: string }).__tag = tag;
  return ctx as unknown as Ctx2D;
}

class FakeOffscreen {
  __tag = "tintbuf";
  width: number;
  height: number;
  ctx: Ctx2D;
  constructor(w: number, h: number, ops: Op[]) {
    this.width = w;
    this.height = h;
    this.ctx = makeRecordingCtx(ops, "tintbuf");
  }
  getContext(): Ctx2D {
    return this.ctx;
  }
}

function makeAtlas(): Map<string, LoadedAtlasImage> {
  const bitmap = { __tag: "bitmap" } as unknown as ImageBitmap;
  const atlas: LoadedAtlasImage = {
    manifest: { id: "ui-font", imageUrl: "", width: 10, height: 7, frames: { g41: { x: 5, y: 0, w: 5, h: 7 } } },
    bitmap,
    frameRect: () => ({ x: 5, y: 0, w: 5, h: 7 }),
  };
  return new Map([["ui-font", atlas]]);
}

// One shared ops array, cleared in place each test. The production `tintBuffer` caches its
// scratch canvas at module scope, so we must keep the SAME array identity the cached ctx
// captured rather than reassign — otherwise later tests would record into a stale array.
const bufOps: Op[] = [];
const realOffscreen = (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas;

beforeEach(() => {
  bufOps.length = 0;
  (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = class {
    constructor(w: number, h: number) {
      return new FakeOffscreen(w, h, bufOps) as unknown as OffscreenCanvas;
    }
  };
});

afterEach(() => {
  (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = realOffscreen;
});

describe("drawUIQuad textured-quad tint", () => {
  it("tints a textured quad: multiply the source by an EDG colour, masked by source alpha", () => {
    const ops: Op[] = [];
    const ctx = makeRecordingCtx(ops, "main");
    const quad: UIQuad = {
      x: 10,
      y: 20,
      width: 5,
      height: 7,
      atlasId: "ui-font",
      frame: "g41",
      color: EDG.gold,
    };

    drawUIQuad(ctx, makeAtlas(), quad, 1);

    // The tint composite happened on the scratch buffer: multiply with the tint colour…
    const mul = bufOps.find((o) => o.op === "fillRect" && o.gco === "multiply");
    expect(mul).toBeDefined();
    expect(mul!.fillStyle).toBe(EDG.gold);
    // …and was masked back to the source alpha (destination-in drawImage of the bitmap).
    expect(bufOps.some((o) => o.op === "drawImage" && o.gco === "destination-in")).toBe(true);

    // The MAIN ctx blits the tint buffer (not the raw atlas bitmap) at the screen rect.
    const blit = ops.find((o) => o.op === "drawImage");
    expect(blit).toBeDefined();
    expect(blit!.src).toBe("tintbuf");
    expect(blit!.args).toEqual([0, 0, 5, 7, 10, 20, 5, 7]);
  });

  it("white (no) tint stays a plain atlas blit — the Chunk-1 untinted path", () => {
    const ops: Op[] = [];
    const ctx = makeRecordingCtx(ops, "main");
    const quad: UIQuad = { x: 0, y: 0, width: 5, height: 7, atlasId: "ui-font", frame: "g41" };

    drawUIQuad(ctx, makeAtlas(), quad, 1);

    expect(bufOps.length).toBe(0); // no scratch buffer used
    const blit = ops.find((o) => o.op === "drawImage");
    expect(blit!.src).toBe("bitmap");
  });

  it("a white tint is treated as a no-op (still a plain blit)", () => {
    const ops: Op[] = [];
    const ctx = makeRecordingCtx(ops, "main");
    const quad: UIQuad = { x: 0, y: 0, width: 5, height: 7, atlasId: "ui-font", frame: "g41", color: EDG.white };

    drawUIQuad(ctx, makeAtlas(), quad, 1);

    expect(bufOps.length).toBe(0);
    expect(ops.find((o) => o.op === "drawImage")!.src).toBe("bitmap");
  });

  it("skips an unknown-atlas quad without throwing, and following quads still draw", () => {
    const ops: Op[] = [];
    const ctx = makeRecordingCtx(ops, "main");
    const atlases = makeAtlas();
    const missing: UIQuad = { x: 0, y: 0, width: 5, height: 7, atlasId: "nope", frame: "g41" };
    const good: UIQuad = { x: 1, y: 1, width: 5, height: 7, atlasId: "ui-font", frame: "g41" };

    // The missing-atlas quad must NOT throw (it would abort the rest of the frame's UI flush).
    expect(() => drawUIQuad(ctx, atlases, missing, 1)).not.toThrow();
    drawUIQuad(ctx, atlases, good, 1);

    // The skipped quad drew nothing; the following good quad still blitted.
    const blits = ops.filter((o) => o.op === "drawImage");
    expect(blits.length).toBe(1);
    expect(blits[0]!.src).toBe("bitmap");
  });

  it("skips an unknown-frame quad without throwing, and following quads still draw", () => {
    const ops: Op[] = [];
    const ctx = makeRecordingCtx(ops, "main");
    const atlases = makeAtlas();
    const missingFrame: UIQuad = { x: 0, y: 0, width: 5, height: 7, atlasId: "ui-font", frame: "ghost" };
    const good: UIQuad = { x: 1, y: 1, width: 5, height: 7, atlasId: "ui-font", frame: "g41" };

    expect(() => drawUIQuad(ctx, atlases, missingFrame, 1)).not.toThrow();
    drawUIQuad(ctx, atlases, good, 1);

    const blits = ops.filter((o) => o.op === "drawImage");
    expect(blits.length).toBe(1);
    expect(blits[0]!.src).toBe("bitmap");
  });

  it("dpr scales the destination rect", () => {
    const ops: Op[] = [];
    const ctx = makeRecordingCtx(ops, "main");
    const quad: UIQuad = { x: 10, y: 20, width: 5, height: 7, atlasId: "ui-font", frame: "g41" };

    drawUIQuad(ctx, makeAtlas(), quad, 2);

    const blit = ops.find((o) => o.op === "drawImage");
    // src rect unchanged (5..), dest rect doubled (20,40,10,14).
    expect(blit!.args).toEqual([5, 0, 5, 7, 20, 40, 10, 14]);
  });
});
