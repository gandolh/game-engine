import { describe, it, expect } from "vitest";
import type { RendererLike, StaticRegion, DecorateFn, Sprite } from "@engine/core";
import type { TerrainGrid } from "@citadel/sim-core";
import { TILE_SIZE } from "@citadel/sim-core";
import { makeIso } from "./iso";
import {
  RenderWindowController,
  windowRegion,
  windowKey,
  shouldWindow,
  WINDOW_TEXEL_THRESHOLD,
  type CameraView,
} from "./window-controller";

function terrain(tilesW: number, tilesH: number): TerrainGrid {
  return { cells: new Uint8Array(tilesW * tilesH), width: tilesW, height: tilesH };
}

interface BakeCall {
  worldWidth: number;
  worldHeight: number;
  region: StaticRegion | undefined;
}

/** Renderer stub that just records bakeStaticLayer calls (no GPU). */
function recordingRenderer(): { renderer: RendererLike; bakes: BakeCall[] } {
  const bakes: BakeCall[] = [];
  const renderer = {
    bakeStaticLayer(
      _sprites: readonly Sprite[],
      worldWidth: number,
      worldHeight: number,
      _decorate?: DecorateFn,
      region?: StaticRegion,
    ): void {
      bakes.push({ worldWidth, worldHeight, region });
    },
  } as unknown as RendererLike;
  return { renderer, bakes };
}

/** A camera centred at (cx,cy) showing a `viewW × viewH` world-px area. */
function cam(cx: number, cy: number, viewW: number, viewH: number): CameraView {
  return { centerX: cx, centerY: cy, worldUnitsX: viewW, worldUnitsY: viewH };
}

describe("pure helpers", () => {
  it("windowRegion is the ISO bounding box of the window's tile diamonds", () => {
    // Brief 110: the region must describe the space the bake actually paints (iso),
    // not an axis-aligned `tile·TILE_SIZE` rect. Derive the expected bbox straight
    // from the projection's diamond extents.
    const iso = makeIso(256, 256);
    const w = { minTx: 10, minTy: 20, maxTx: 12, maxTy: 23 };
    const HW = 16, HH = 8;
    const left = iso.tileCenterToIso(w.minTx, w.maxTy).x - HW;
    const right = iso.tileCenterToIso(w.maxTx, w.minTy).x + HW;
    const top = iso.tileCenterToIso(w.minTx, w.minTy).y - HH;
    const bottom = iso.tileCenterToIso(w.maxTx, w.maxTy).y + HH;

    expect(windowRegion(iso, w)).toEqual({
      originX: Math.max(0, Math.floor(left)),
      originY: Math.max(0, Math.floor(top)),
      width: Math.ceil(right - left),
      height: Math.ceil(bottom - top),
    });
  });

  it("windowRegion for the WHOLE grid covers the whole iso world", () => {
    const iso = makeIso(256, 256);
    const r = windowRegion(iso, { minTx: 0, minTy: 0, maxTx: 255, maxTy: 255 });
    expect(r.originX).toBe(0);
    expect(r.originY).toBeGreaterThanOrEqual(0);
    expect(r.width).toBe(iso.worldPxW);
  });

  it("windowKey is stable + distinguishes windows", () => {
    expect(windowKey({ minTx: 1, minTy: 2, maxTx: 3, maxTy: 4 })).toBe("1,2,3,4");
    expect(windowKey({ minTx: 1, minTy: 2, maxTx: 3, maxTy: 4 }))
      .not.toBe(windowKey({ minTx: 1, minTy: 2, maxTx: 3, maxTy: 5 }));
  });

  it("shouldWindow trips only above the texel threshold — measured on ISO extents", () => {
    const solo = makeIso(96, 96);   // 3072 × 1552 ≈ 4.8 M texels
    const mp = makeIso(256, 256);   // 8192 × 4112 ≈ 33.7 M texels, ~134.7 MB RGBA
    expect(shouldWindow(solo.worldPxW, solo.worldPxH)).toBe(false);
    expect(shouldWindow(mp.worldPxW, mp.worldPxH)).toBe(true);
    expect(shouldWindow(4096, 4096)).toBe(false); // exactly the threshold (not >)
    expect(4096 * 4096).toBe(WINDOW_TEXEL_THRESHOLD);

    // The MP world MUST window: its iso width sits exactly on WebGPU's default
    // maxTextureDimension2D, and a whole-world bake would be ~134.7 MB.
    expect(mp.worldPxW).toBe(8192);
    expect(mp.worldPxW * mp.worldPxH * 4).toBeGreaterThan(134_000_000);
  });
});

describe("RenderWindowController — small world (whole-world bake)", () => {
  it("is not windowed and bakes the whole world ONCE with no region", () => {
    const { renderer, bakes } = recordingRenderer();
    const ctrl = new RenderWindowController(renderer, makeIso(96, 96), terrain(96, 96));
    expect(ctrl.windowed).toBe(false);

    ctrl.bakeInitial(cam(768, 768, 1536, 1536));
    expect(bakes).toHaveLength(1);
    // Iso: the whole-world bake uses the ISO-world-sized texture (diamonds),
    // not the axis-aligned 96·16 grid.
    const solo = makeIso(96, 96);
    expect(bakes[0]).toEqual({ worldWidth: solo.worldPxW, worldHeight: solo.worldPxH, region: undefined });

    // Panning never re-bakes a whole-world map.
    expect(ctrl.update(cam(100, 100, 400, 400))).toBe(false);
    expect(ctrl.update(cam(900, 900, 400, 400))).toBe(false);
    expect(bakes).toHaveLength(1);
  });
});

describe("RenderWindowController — large world (windowed bake)", () => {
  const WORLD = 256;
  const isoMp = makeIso(WORLD, WORLD); // 8192 × 4112 iso px

  it("bakes only the camera window (texture much smaller than the world)", () => {
    const { renderer, bakes } = recordingRenderer();
    const ctrl = new RenderWindowController(renderer, isoMp, terrain(WORLD, WORLD), { pad: 4 });
    expect(ctrl.windowed).toBe(true);

    // Zoomed in: a 640×480-px viewport centred mid-map (iso world-px).
    const c = isoMp.tileCenterToIso(128, 128);
    ctrl.bakeInitial(cam(c.x, c.y, 640, 480));
    expect(bakes).toHaveLength(1);
    const reg = bakes[0]!.region!;
    // The LOGICAL world reported to the engine stays the full iso extent (the camera
    // frames that space); only the written REGION is the window.
    expect(bakes[0]!.worldWidth).toBe(isoMp.worldPxW);
    expect(bakes[0]!.worldHeight).toBe(isoMp.worldPxH);
    // Window is far smaller than the full iso world → flat memory. Measured against
    // the ISO extents, which is the texture actually being allocated.
    const worldTexels = isoMp.worldPxW * isoMp.worldPxH;
    expect(reg.width).toBeLessThan(isoMp.worldPxW);
    expect(reg.height).toBeLessThan(isoMp.worldPxH);
    expect(reg.width * reg.height).toBeLessThan(worldTexels * 0.1);
    // Region stays inside the world.
    expect(reg.originX).toBeGreaterThanOrEqual(0);
    expect(reg.originY).toBeGreaterThanOrEqual(0);
    expect(reg.originX + reg.width).toBeLessThanOrEqual(isoMp.worldPxW);
  });

  it("does NOT re-bake when the window is unchanged", () => {
    const { renderer, bakes } = recordingRenderer();
    const ctrl = new RenderWindowController(renderer, makeIso(WORLD, WORLD), terrain(WORLD, WORLD));
    const c = cam(2048, 2048, 640, 480);
    ctrl.bakeInitial(c);
    expect(bakes).toHaveLength(1);
    // Same camera, repeated frames → the tile window is identical → no re-bake.
    expect(ctrl.update(c)).toBe(false);
    expect(ctrl.update(cam(2048, 2048, 640, 480))).toBe(false);
    expect(bakes).toHaveLength(1);
    expect(ctrl.pending).toBe(0);
  });

  it("re-bakes a new window after a real pan (≤1 bake / frame)", () => {
    const { renderer, bakes } = recordingRenderer();
    const ctrl = new RenderWindowController(renderer, makeIso(WORLD, WORLD), terrain(WORLD, WORLD));
    ctrl.bakeInitial(cam(2048, 2048, 640, 480));
    const before = windowKey(ctrl.bakedWindow!);

    // Pan a long way → the window must move.
    const rebaked = ctrl.update(cam(3000, 3000, 640, 480));
    expect(rebaked).toBe(true);
    expect(bakes).toHaveLength(2);
    expect(windowKey(ctrl.bakedWindow!)).not.toBe(before);
    // Exactly one bake this frame (budget = 1).
  });

  it("coalesces a fast multi-frame pan to the latest window, one bake per frame", () => {
    const { renderer, bakes } = recordingRenderer();
    const ctrl = new RenderWindowController(renderer, makeIso(WORLD, WORLD), terrain(WORLD, WORLD));
    ctrl.bakeInitial(cam(2048, 2048, 640, 480));
    expect(bakes).toHaveLength(1);

    // Three successive frames, each a big jump. Each frame drains ≤1 bake and
    // converges to that frame's window (never lags behind on stale windows).
    ctrl.update(cam(2500, 2500, 640, 480));
    ctrl.update(cam(3000, 3000, 640, 480));
    ctrl.update(cam(1000, 1000, 640, 480));
    expect(bakes).toHaveLength(4); // initial + 3 frames, one each
    expect(ctrl.pending).toBe(0);

    // The final baked window tracks the LAST camera (centre ~1000,1000), not a
    // stale earlier one.
    const last = ctrl.bakedWindow!;
    expect(last.minTx).toBeLessThan(2048 / TILE_SIZE);
  });
});
