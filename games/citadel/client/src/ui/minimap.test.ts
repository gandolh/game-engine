/**
 * Tests for the in-canvas minimap (minimap.ts) — pure geometry, no real canvas.
 *
 * The point of the in-canvas migration is that the minimap no longer owns a
 * Canvas2D context, so its geometry (the face-px ↔ iso ↔ tile fit and the
 * `trySeek` hit-test) is now testable headlessly. We assert:
 *   1. the face-px → iso → continuous-tile inversion round-trips a known point;
 *   2. `trySeek` accepts an in-face press (firing `onSeek` with the right tile)
 *      and rejects an out-of-face press (returning false, no `onSeek`).
 */
import { describe, it, expect } from "vitest";
import type { TerrainGrid } from "@citadel/sim-core";
import { tileToIso, ISO_WORLD_W, ISO_WORLD_H } from "../render/iso";
import { CitadelMinimap, MINIMAP_FACE } from "./minimap";

/** A tiny all-grass terrain grid (terrain content is irrelevant to geometry). */
function fakeTerrain(width = 4, height = 4): TerrainGrid {
  return { cells: new Uint8Array(width * height), width, height };
}

// The same uniform fit the minimap computes: iso world-px → face px.
const FIT_SCALE = MINIMAP_FACE / Math.max(ISO_WORLD_W, ISO_WORLD_H);
const FIT_OFF_X = (MINIMAP_FACE - ISO_WORLD_W * FIT_SCALE) / 2;
const FIT_OFF_Y = (MINIMAP_FACE - ISO_WORLD_H * FIT_SCALE) / 2;
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
    const iso = tileToIso(tileX, tileY);
    const { fx, fy } = isoToFace(iso.x, iso.y);

    const originX = 600;
    const originY = 8;
    let got: { tx: number; ty: number } | null = null;
    const mm = new CitadelMinimap(fakeTerrain(40, 40), (tx, ty) => { got = { tx, ty }; });

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
    const mm = new CitadelMinimap(fakeTerrain(), () => { seeks++; });

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
    const mm = new CitadelMinimap(fakeTerrain(), () => {});
    // Top-left and bottom-right corners are inside [0, faceSize].
    expect(mm.trySeek(originX, originY, originX, originY)).toBe(true);
    expect(mm.trySeek(originX + MINIMAP_FACE, originY + MINIMAP_FACE, originX, originY)).toBe(true);
  });
});
