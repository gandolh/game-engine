import { describe, it, expect } from "vitest";
import type { RendererLike, StaticRegion, DecorateFn, Sprite } from "@engine/core";
import type { TerrainGrid } from "@citadel/sim-core";
import { TILE_SIZE } from "@citadel/sim-core";
import { ISO_WORLD_W, ISO_WORLD_H } from "./iso";
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
  it("windowRegion converts a tile window to a world-px region", () => {
    expect(windowRegion({ minTx: 10, minTy: 20, maxTx: 12, maxTy: 23 }, 16)).toEqual({
      originX: 160,
      originY: 320,
      width: 3 * 16,
      height: 4 * 16,
    });
  });

  it("windowKey is stable + distinguishes windows", () => {
    expect(windowKey({ minTx: 1, minTy: 2, maxTx: 3, maxTy: 4 })).toBe("1,2,3,4");
    expect(windowKey({ minTx: 1, minTy: 2, maxTx: 3, maxTy: 4 }))
      .not.toBe(windowKey({ minTx: 1, minTy: 2, maxTx: 3, maxTy: 5 }));
  });

  it("shouldWindow trips only above the texel threshold", () => {
    expect(shouldWindow(96 * 16, 96 * 16)).toBe(false); // 1536² solo
    expect(shouldWindow(256 * 16, 256 * 16)).toBe(true); // 4096² MP
    expect(shouldWindow(2048, 2048)).toBe(false); // exactly the threshold (not >)
    expect(2048 * 2048).toBe(WINDOW_TEXEL_THRESHOLD);
  });
});

describe("RenderWindowController — small world (whole-world bake)", () => {
  it("is not windowed and bakes the whole world ONCE with no region", () => {
    const { renderer, bakes } = recordingRenderer();
    const ctrl = new RenderWindowController(renderer, terrain(96, 96));
    expect(ctrl.windowed).toBe(false);

    ctrl.bakeInitial(cam(768, 768, 1536, 1536));
    expect(bakes).toHaveLength(1);
    // Iso: the whole-world bake uses the ISO-world-sized texture (diamonds),
    // not the axis-aligned 96·16 grid.
    expect(bakes[0]).toEqual({ worldWidth: ISO_WORLD_W, worldHeight: ISO_WORLD_H, region: undefined });

    // Panning never re-bakes a whole-world map.
    expect(ctrl.update(cam(100, 100, 400, 400))).toBe(false);
    expect(ctrl.update(cam(900, 900, 400, 400))).toBe(false);
    expect(bakes).toHaveLength(1);
  });
});

describe("RenderWindowController — large world (windowed bake)", () => {
  const WORLD = 256;
  const PX = WORLD * TILE_SIZE; // 4096

  it("bakes only the camera window (texture much smaller than the world)", () => {
    const { renderer, bakes } = recordingRenderer();
    const ctrl = new RenderWindowController(renderer, terrain(WORLD, WORLD), { pad: 4 });
    expect(ctrl.windowed).toBe(true);

    // Zoomed in: a 640×480-px viewport centred mid-map.
    ctrl.bakeInitial(cam(2048, 2048, 640, 480));
    expect(bakes).toHaveLength(1);
    const reg = bakes[0]!.region!;
    expect(bakes[0]!.worldWidth).toBe(PX); // logical world still reported full
    // Window is far smaller than the full 4096² world → flat memory.
    expect(reg.width).toBeLessThan(PX);
    expect(reg.height).toBeLessThan(PX);
    expect(reg.width * reg.height).toBeLessThan(PX * PX * 0.1);
    // Region stays inside the world.
    expect(reg.originX).toBeGreaterThanOrEqual(0);
    expect(reg.originY).toBeGreaterThanOrEqual(0);
    expect(reg.originX + reg.width).toBeLessThanOrEqual(PX);
  });

  it("does NOT re-bake when the window is unchanged", () => {
    const { renderer, bakes } = recordingRenderer();
    const ctrl = new RenderWindowController(renderer, terrain(WORLD, WORLD));
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
    const ctrl = new RenderWindowController(renderer, terrain(WORLD, WORLD));
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
    const ctrl = new RenderWindowController(renderer, terrain(WORLD, WORLD));
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
