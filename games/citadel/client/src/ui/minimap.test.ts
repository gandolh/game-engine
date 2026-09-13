/**
 * Tests for the in-canvas minimap (minimap.ts) — pure geometry, no real canvas.
 *
 * The point of the in-canvas migration is that the minimap no longer owns a
 * Canvas2D context, so its geometry (the face-px ↔ iso ↔ tile fit and the
 * `trySeek` hit-test) is now testable headlessly. We assert:
 *   1. the face-px → iso → continuous-tile inversion round-trips a known point;
 *   2. `trySeek` accepts an in-face press (firing `onSeek` with the right tile)
 *      and rejects an out-of-face press (returning false, no `onSeek`).
 *
 * Brief 110: the minimap's fit now comes from the {@link IsoProjection} it is
 * handed, so the projection and the terrain grid must describe the SAME world.
 * (They didn't before — the fit read module constants for a 96×96 world while the
 * tests passed a 40×40 grid. Harmless then, wrong now.)
 */
import { describe, it, expect } from "vitest";
import type { TerrainGrid } from "@citadel/sim-core";
import { generateTerrain, WORLD_WIDTH, WORLD_HEIGHT } from "@citadel/sim-core";
import { makeIso } from "../render/iso";
import type { UISurface } from "@engine/ui/render";
import { CitadelMinimap, MINIMAP_FACE, type MinimapFrame } from "./minimap";

const WORLD = 40;
const proj = makeIso(WORLD, WORLD);

/** A tiny all-grass terrain grid (terrain content is irrelevant to geometry). */
function fakeTerrain(width = WORLD, height = WORLD): TerrainGrid {
  return { cells: new Uint8Array(width * height), width, height };
}

// The same uniform fit the minimap computes: iso world-px → face px.
const FIT_SCALE = MINIMAP_FACE / Math.max(proj.worldPxW, proj.worldPxH);
const FIT_OFF_X = (MINIMAP_FACE - proj.worldPxW * FIT_SCALE) / 2;
const FIT_OFF_Y = (MINIMAP_FACE - proj.worldPxH * FIT_SCALE) / 2;
function isoToFace(isoX: number, isoY: number): { fx: number; fy: number } {
  return { fx: FIT_OFF_X + isoX * FIT_SCALE, fy: FIT_OFF_Y + isoY * FIT_SCALE };
}

describe("CitadelMinimap geometry", () => {
  it("round-trips a known face point back to its tile via trySeek", () => {
    // Pick a known continuous tile, project it the way draw() does (iso → face),
    // then feed that face point (offset by an origin) into trySeek and assert the
    // seek lands on the same tile.
    const tileX = 3.25;
    const tileY = 7.75;
    const p = proj.tileToIso(tileX, tileY);
    const { fx, fy } = isoToFace(p.x, p.y);

    const originX = 600;
    const originY = 8;
    let got: { tx: number; ty: number } | null = null;
    const mm = new CitadelMinimap(proj, fakeTerrain(), (tx, ty) => { got = { tx, ty }; });

    const consumed = mm.trySeek(originX + fx, originY + fy, originX, originY);
    expect(consumed).toBe(true);
    expect(got).not.toBeNull();
    expect(got!.tx).toBeCloseTo(tileX, 6);
    expect(got!.ty).toBeCloseTo(tileY, 6);
  });

  it("accepts an in-face press and rejects an out-of-face press", () => {
    const originX = 600;
    const originY = 8;
    let seeks = 0;
    const mm = new CitadelMinimap(proj, fakeTerrain(), () => { seeks++; });

    // Centre of the face → consumed.
    const cx = originX + MINIMAP_FACE / 2;
    const cy = originY + MINIMAP_FACE / 2;
    expect(mm.trySeek(cx, cy, originX, originY)).toBe(true);
    expect(seeks).toBe(1);

    // Just left of the face → rejected, no seek.
    expect(mm.trySeek(originX - 1, cy, originX, originY)).toBe(false);
    // Just below the face → rejected, no seek.
    expect(mm.trySeek(cx, originY + MINIMAP_FACE + 1, originX, originY)).toBe(false);
    expect(seeks).toBe(1);
  });

  it("treats the face edges as inclusive bounds", () => {
    const originX = 100;
    const originY = 100;
    const mm = new CitadelMinimap(proj, fakeTerrain(), () => {});
    // Top-left and bottom-right corners are inside [0, faceSize].
    expect(mm.trySeek(originX, originY, originX, originY)).toBe(true);
    expect(mm.trySeek(originX + MINIMAP_FACE, originY + MINIMAP_FACE, originX, originY)).toBe(true);
  });

  it("fits a LARGER world into the same face (the fit tracks the projection)", () => {
    // Brief 110 regression: the fit used to come from compile-time constants, so a
    // minimap of the 256×256 MP world silently framed a 96×96 diamond.
    const mp = makeIso(256, 256);
    const mm = new CitadelMinimap(mp, { cells: new Uint8Array(256 * 256), width: 256, height: 256 }, () => {});
    // The world's far corner must still land inside the face.
    let seeked: { tx: number; ty: number } | null = null;
    const mm2 = new CitadelMinimap(mp, { cells: new Uint8Array(256 * 256), width: 256, height: 256 }, (tx, ty) => { seeked = { tx, ty }; });
    const scale = MINIMAP_FACE / Math.max(mp.worldPxW, mp.worldPxH);
    const offX = (MINIMAP_FACE - mp.worldPxW * scale) / 2;
    const offY = (MINIMAP_FACE - mp.worldPxH * scale) / 2;
    const far = mp.tileToIso(255, 255);
    expect(mm.trySeek(offX + far.x * scale, offY + far.y * scale, 0, 0)).toBe(true);
    mm2.trySeek(offX + far.x * scale, offY + far.y * scale, 0, 0);
    expect(seeked).not.toBeNull();
    expect(seeked!.tx).toBeCloseTo(255, 0);
    expect(seeked!.ty).toBeCloseTo(255, 0);
  });
});

/** A `surface.rect(...)`-counting stand-in for `UISurface` (same pattern as
 *  `engine/ui/src/widget/custom.test.ts`'s `fakeSurface`) — this is how audit-02's
 *  before/after per-frame quad count is measured: not estimated, counted. */
function countingSurface(): { surface: UISurface; count: () => number } {
  let calls = 0;
  const surface = {
    begin: () => {},
    end: () => {},
    push: () => { calls++; },
    rect: () => { calls++; },
    sprite: () => { calls++; },
  } as unknown as UISurface; // structurally a UISurface for what `draw()` actually calls (rect only)
  return { surface, count: () => calls };
}

const EMPTY_FRAME: MinimapFrame = {
  buildings: [],
  villagers: [],
  raiders: [],
  transform: { centerX: 0, centerY: 0, worldUnitsX: 100, worldUnitsY: 100, canvasW: 800, canvasH: 600 },
};

describe("CitadelMinimap per-frame quad count (audit-02)", () => {
  it("a uniform-terrain face draws far fewer quads than one per tile", () => {
    // All-grass 40x40 world (fakeTerrain from the geometry tests above): the OLD per-tile
    // scheme would submit 1600 terrain quads every frame; the merged bake should collapse
    // the whole (single-colour) diamond into a small number of rows/rects instead.
    const mm = new CitadelMinimap(proj, fakeTerrain(), () => {});
    const { surface, count } = countingSurface();
    mm.draw(surface, 0, 0, EMPTY_FRAME);
    // 1 backing panel + 4 viewport edges = 5 non-terrain quads for an empty frame.
    const terrainQuads = count() - 5;
    expect(terrainQuads).toBeGreaterThan(0);
    expect(terrainQuads).toBeLessThan(1600 / 4); // measured well under a quarter of the old count
  });

  it("the live 192x192 generated world drops from 36,864 tile-quads to a small merged set", () => {
    // Real terrain (deterministic seed, no sim tick loop — a single pure generateTerrain
    // call, same as the sim-core unit tests use), at the actual default world size.
    const world = generateTerrain(1, WORLD_WIDTH, WORLD_HEIGHT);
    const worldIso = makeIso(WORLD_WIDTH, WORLD_HEIGHT);
    const mm = new CitadelMinimap(worldIso, world, () => {});
    const { surface, count } = countingSurface();
    mm.draw(surface, 0, 0, EMPTY_FRAME);

    const OLD_PER_TILE_COUNT = WORLD_WIDTH * WORLD_HEIGHT; // 36,864 — the audit-02 defect
    const totalQuads = count();
    const terrainQuads = totalQuads - 5; // minus backing panel + 4 viewport edges

    expect(terrainQuads).toBeGreaterThan(0);
    // The real acceptance bar (audit-02): a small fraction of one-per-tile, not a bespoke
    // "close enough" number — assert an order-of-magnitude cut, and let the test failure
    // message report the exact measured counts for the audit trail.
    expect(terrainQuads).toBeLessThan(OLD_PER_TILE_COUNT / 10);
  });
});
