/**
 * Tests for the render-only entity position interpolator. Pure logic (no GPU,
 * no DOM), so these run headlessly: ingest snapshots, then assert the
 * interpolated position at various render fractions, including the snap edge
 * cases (new id, teleport) that must NOT smear across the map.
 */
import { describe, it, expect } from "vitest";
import { EntityInterpolator, snapshotAlpha, MAX_LERP_TILES } from "./entity-interp";

describe("EntityInterpolator", () => {
  it("a fresh id draws at its position (no history → no lerp)", () => {
    const interp = new EntityInterpolator();
    interp.ingest([{ id: 1, x: 5, y: 7 }]);
    // Even mid-alpha, a brand-new id sits at its current tile (prev == cur).
    expect(interp.positionOf(1, 0.5, 5, 7)).toEqual({ x: 5, y: 7 });
  });

  it("interpolates linearly between the previous and current snapshot tile", () => {
    const interp = new EntityInterpolator();
    interp.ingest([{ id: 1, x: 0, y: 0 }]); // first: prev==cur==(0,0)
    interp.ingest([{ id: 1, x: 1, y: 0 }]); // step east: prev=(0,0) cur=(1,0)
    expect(interp.positionOf(1, 0, 1, 0)).toEqual({ x: 0, y: 0 });   // start of gap
    expect(interp.positionOf(1, 0.5, 1, 0)).toEqual({ x: 0.5, y: 0 }); // halfway
    expect(interp.positionOf(1, 1, 1, 0)).toEqual({ x: 1, y: 0 });   // end of gap
  });

  it("clamps alpha outside [0,1]", () => {
    const interp = new EntityInterpolator();
    interp.ingest([{ id: 1, x: 0, y: 0 }]);
    interp.ingest([{ id: 1, x: 2, y: 0 }]); // delta 2 == MAX_LERP_TILES → still lerps
    expect(interp.positionOf(1, -1, 2, 0)).toEqual({ x: 0, y: 0 });
    expect(interp.positionOf(1, 5, 2, 0)).toEqual({ x: 2, y: 0 });
  });

  it("snaps (does not lerp) on a teleport beyond MAX_LERP_TILES", () => {
    const interp = new EntityInterpolator();
    interp.ingest([{ id: 1, x: 0, y: 0 }]);
    interp.ingest([{ id: 1, x: 0, y: 0 }]); // establish prev==cur, snap clears
    interp.ingest([{ id: 1, x: MAX_LERP_TILES + 5, y: 0 }]); // big jump (load/replay)
    // Mid-alpha must show the CURRENT tile, not a smear across the map.
    expect(interp.positionOf(1, 0.5, MAX_LERP_TILES + 5, 0)).toEqual({ x: MAX_LERP_TILES + 5, y: 0 });
  });

  it("a one-tile diagonal step interpolates on both axes", () => {
    const interp = new EntityInterpolator();
    interp.ingest([{ id: 9, x: 10, y: 10 }]);
    interp.ingest([{ id: 9, x: 11, y: 11 }]);
    expect(interp.positionOf(9, 0.25, 11, 11)).toEqual({ x: 10.25, y: 10.25 });
  });

  it("prunes ids absent from the latest snapshot", () => {
    const interp = new EntityInterpolator();
    interp.ingest([{ id: 1, x: 0, y: 0 }, { id: 2, x: 5, y: 5 }]);
    expect(interp.size).toBe(2);
    interp.ingest([{ id: 1, x: 1, y: 0 }]); // id 2 despawned
    expect(interp.size).toBe(1);
    // An unknown id falls back to its passed-in position.
    expect(interp.positionOf(2, 0.5, 99, 99)).toEqual({ x: 99, y: 99 });
  });

  it("an id that despawns then respawns is snapped, not smeared", () => {
    const interp = new EntityInterpolator();
    interp.ingest([{ id: 1, x: 0, y: 0 }]);
    interp.ingest([]);                       // despawn → pruned
    interp.ingest([{ id: 1, x: 40, y: 40 }]); // reused id, far away → fresh, snap
    expect(interp.positionOf(1, 0.5, 40, 40)).toEqual({ x: 40, y: 40 });
  });

  describe("isMoving", () => {
    it("is false for a stationary entity and true after a real step", () => {
      const interp = new EntityInterpolator();
      interp.ingest([{ id: 1, x: 5, y: 5 }]); // fresh → not moving
      expect(interp.isMoving(1)).toBe(false);
      interp.ingest([{ id: 1, x: 5, y: 5 }]); // same tile → not moving
      expect(interp.isMoving(1)).toBe(false);
      interp.ingest([{ id: 1, x: 6, y: 5 }]); // stepped east → moving
      expect(interp.isMoving(1)).toBe(true);
    });

    it("is false on a teleport (snap) and for unknown ids", () => {
      const interp = new EntityInterpolator();
      interp.ingest([{ id: 1, x: 0, y: 0 }]);
      interp.ingest([{ id: 1, x: 0, y: 0 }]);
      interp.ingest([{ id: 1, x: 50, y: 50 }]); // teleport → snap, not "moving"
      expect(interp.isMoving(1)).toBe(false);
      expect(interp.isMoving(999)).toBe(false);
    });
  });
});

describe("snapshotAlpha", () => {
  it("is 1 when the interval is unknown (single snapshot / stall)", () => {
    expect(snapshotAlpha(1000, 900, 0)).toBe(1);
  });

  it("is the elapsed fraction of the interval, clamped to [0,1]", () => {
    expect(snapshotAlpha(1000, 1000, 50)).toBe(0);   // just arrived
    expect(snapshotAlpha(1025, 1000, 50)).toBe(0.5); // halfway
    expect(snapshotAlpha(1050, 1000, 50)).toBe(1);   // at next
    expect(snapshotAlpha(1200, 1000, 50)).toBe(1);   // overshoot clamps
    expect(snapshotAlpha(990, 1000, 50)).toBe(0);    // negative clamps
  });
});
