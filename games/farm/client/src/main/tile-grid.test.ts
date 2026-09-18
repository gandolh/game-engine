/**
 * audit-60 — the invariant the 15 copies of `TILE = 16` were silently relying on.
 *
 * The tile→world-pixel scale is load-bearing on BOTH sides of the sim↔render boundary:
 * `@farm/sim-core`'s render-systems emit sprite coordinates in `tile * TILE` space, and the client
 * inverts that with `screenToTile`'s `Math.floor(wx / TILE)`. While it was 15 private constants,
 * changing the atlas frame size meant 15 coordinated edits across 4 packages — and missing one
 * under `sim-core/render-systems/` put the sim's sprite grid and the client's hit-mapping on
 * different scales, so **hover and click silently target the wrong tile** while every unit test
 * stayed green, because the tests hardcoded their own 16 too.
 *
 * Nothing checked the round trip. This does.
 */
import { describe, it, expect } from "vitest";
import { Camera2D, TILE as ENGINE_TILE } from "@engine/core/render";
import { emitterPx } from "@farm/sim-core/render-systems";
import { TILE as CLIENT_TILE } from "./config";
import { screenToTile, worldToCanvasCss, screenToWorld } from "./screen-to-tile";

/** jsdom reports clientWidth/Height as 0; the mapping divides by them, so stub them. */
function makeCanvas(w = 800, h = 600): HTMLCanvasElement {
  return { clientWidth: w, clientHeight: h } as unknown as HTMLCanvasElement;
}

function makeCamera(): Camera2D {
  return new Camera2D({ worldUnitsX: 640, worldUnitsY: 480, centerX: 512, centerY: 384 });
}

/** The SIM's tile→world-px conversion, taken from real exported sim-core code, not re-derived. */
function simTileCentrePx(tx: number, ty: number): { x: number; y: number } {
  const p = emitterPx({ tx, ty, radiusTiles: 1, color: "#ffffff", intensity: 1 });
  return { x: p.x, y: p.y };
}

describe("one TILE, shared by the engine, the sim and the client", () => {
  it("the client re-exports the engine's constant rather than keeping its own", () => {
    expect(CLIENT_TILE).toBe(ENGINE_TILE);
  });

  it("the sim's sprite grid is built on that same constant", () => {
    // emitterPx is `tx * TILE + TILE / 2` inside @farm/sim-core.
    for (const t of [0, 1, 7, 42]) {
      expect(simTileCentrePx(t, t).x).toBe(t * ENGINE_TILE + ENGINE_TILE / 2);
    }
  });
});

describe("screenToTile inverts the sim's sprite grid (round trip)", () => {
  it("a tile centre emitted by the SIM maps back to that tile in the CLIENT", () => {
    const camera = makeCamera();
    const canvas = makeCanvas();
    for (const [tx, ty] of [[0, 0], [3, 5], [31, 17], [64, 64]] as const) {
      const world = simTileCentrePx(tx, ty);
      const css = worldToCanvasCss(camera, canvas, world.x, world.y);
      expect(screenToTile(camera, canvas, css.x, css.y), `tile ${String(tx)},${String(ty)}`)
        .toEqual({ x: tx, y: ty });
    }
  });

  it("holds at every zoom level, not just 1:1", () => {
    const canvas = makeCanvas();
    for (const zoom of [0.5, 1, 2, 3, 6]) {
      const camera = makeCamera();
      camera.setZoom(zoom);
      const world = simTileCentrePx(20, 11);
      const css = worldToCanvasCss(camera, canvas, world.x, world.y);
      expect(screenToTile(camera, canvas, css.x, css.y), `zoom ${String(zoom)}`)
        .toEqual({ x: 20, y: 11 });
    }
  });

  it("a point just inside a tile's far edge is that tile; a px past it is the next", () => {
    const camera = makeCamera();
    const canvas = makeCanvas();
    const tx = 12;
    const ty = 9;
    const edgeX = (tx + 1) * ENGINE_TILE;
    const edgeY = (ty + 1) * ENGINE_TILE;

    const inside = worldToCanvasCss(camera, canvas, edgeX - 0.5, edgeY - 0.5);
    expect(screenToTile(camera, canvas, inside.x, inside.y)).toEqual({ x: tx, y: ty });

    const past = worldToCanvasCss(camera, canvas, edgeX + 0.5, edgeY + 0.5);
    expect(screenToTile(camera, canvas, past.x, past.y)).toEqual({ x: tx + 1, y: ty + 1 });
  });

  it("screenToWorld and worldToCanvasCss are exact inverses", () => {
    const camera = makeCamera();
    const canvas = makeCanvas();
    for (const [wx, wy] of [[0, 0], [123.5, 77.25], [1024, 768]] as const) {
      const css = worldToCanvasCss(camera, canvas, wx, wy);
      const back = screenToWorld(camera, canvas, css.x, css.y);
      expect(back.wx).toBeCloseTo(wx, 9);
      expect(back.wy).toBeCloseTo(wy, 9);
    }
  });

  it("sweeps a run of tiles rather than spot-checking a lucky few", () => {
    const camera = makeCamera();
    const canvas = makeCanvas();
    for (let t = 0; t < 120; t++) {
      const world = simTileCentrePx(t, t);
      const css = worldToCanvasCss(camera, canvas, world.x, world.y);
      expect(screenToTile(camera, canvas, css.x, css.y), `tile ${String(t)}`).toEqual({ x: t, y: t });
    }
  });
});
