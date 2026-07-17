/**
 * Tests for the render-only entity position interpolator. Pure logic (no GPU,
 * no DOM), so these run headlessly: ingest snapshots, then assert the
 * interpolated position at various render phases, including the snap edge
 * cases (new id, teleport) that must NOT smear across the map.
 *
 * Since 2026-07-16 positionOf renders a RENDER_DELAY_INTERVALS (=1.5) jitter
 * buffer BEHIND the newest snapshot (see entity-interp.ts's header): `phase` is
 * the elapsed fraction of the measured interval since the newest snapshot, and the
 * drawn position lags by `behind = RENDER_DELAY_INTERVALS - phase` intervals
 * (newest tile at behind 0, prev at 1, prevPrev at 2). So on a clean 3-tile
 * straight run, phase 0 sits halfway prevPrev→prev, phase 0.5 at prev, and phase
 * 1.5 at cur.
 */
import { describe, it, expect } from "vitest";
import {
  EntityInterpolator,
  snapshotPhase,
  shouldIngestSnapshot,
  MAX_LERP_TILES,
  RENDER_DELAY_INTERVALS,
} from "./entity-interp";

describe("EntityInterpolator", () => {
  it("a fresh id draws at its position (no history → no lerp)", () => {
    const interp = new EntityInterpolator();
    interp.ingest([{ id: 1, x: 5, y: 7 }]);
    // Even mid-phase, a brand-new id sits at its current tile (snap flag set).
    expect(interp.positionOf(1, 1, 5, 7)).toEqual({ x: 5, y: 7 });
  });

  it("renders the jitter buffer behind the newest: prevPrev→prev→cur as phase runs 0→2", () => {
    const interp = new EntityInterpolator();
    interp.ingest([{ id: 1, x: 0, y: 0 }]); // fresh
    interp.ingest([{ id: 1, x: 1, y: 0 }]); // step E (first move)
    interp.ingest([{ id: 1, x: 2, y: 0 }]); // step E again — history now valid (3 tiles)
    // phase 0: the deepest we render (behind = RENDER_DELAY_INTERVALS = 1.5) →
    // halfway along the buffered prevPrev→prev segment.
    expect(interp.positionOf(1, 0, 2, 0)).toEqual({ x: 0.5, y: 0 });
    // phase 0.5: one interval behind → exactly prev (1,0).
    expect(interp.positionOf(1, 0.5, 2, 0)).toEqual({ x: 1, y: 0 });
    // phase 1.5: caught up to the newest → cur (2,0).
    expect(interp.positionOf(1, 1.5, 2, 0)).toEqual({ x: 2, y: 0 });
  });

  it("holds at the newest tile (does not extrapolate) once a gap outlasts the buffer", () => {
    const interp = new EntityInterpolator();
    interp.ingest([{ id: 1, x: 0, y: 0 }]);
    interp.ingest([{ id: 1, x: 1, y: 0 }]);
    interp.ingest([{ id: 1, x: 2, y: 0 }]);
    // phase beyond RENDER_DELAY_INTERVALS: clamps at cur, never past it.
    expect(interp.positionOf(1, 5, 2, 0)).toEqual({ x: 2, y: 0 });
    // Negative phase clamps to the deepest buffered position (behind = 1.5).
    expect(interp.positionOf(1, -3, 2, 0)).toEqual({ x: 0.5, y: 0 });
  });

  it("stays exactly linear on a straight multi-tile run (collinear ⇒ no wobble)", () => {
    const interp = new EntityInterpolator();
    interp.ingest([{ id: 1, x: 0, y: 0 }]); // fresh
    interp.ingest([{ id: 1, x: 1, y: 0 }]); // step E (first move)
    interp.ingest([{ id: 1, x: 2, y: 0 }]); // step E again — 3-tile history
    // Buffered prevPrev→prev half (behind ∈ [1,1.5]): straight line, no wobble.
    expect(interp.positionOf(1, 0.25, 2, 0)).toEqual({ x: 0.75, y: 0 });
    // prev→cur half (behind ∈ [0,1]): straight line continues.
    expect(interp.positionOf(1, 1, 2, 0)).toEqual({ x: 1.5, y: 0 });
    expect(interp.positionOf(1, 1.25, 2, 0)).toEqual({ x: 1.75, y: 0 });
  });

  it("a one-tile diagonal first step interpolates on both axes (shallow buffer)", () => {
    const interp = new EntityInterpolator();
    interp.ingest([{ id: 9, x: 10, y: 10 }]);
    interp.ingest([{ id: 9, x: 11, y: 11 }]); // first move → histValid false → buffer depth 1
    // Only prev→cur is buffered (depth 1): phase 0.75 ⇒ behind 0.75 ⇒ a=0.25.
    expect(interp.positionOf(9, 0.75, 11, 11)).toEqual({ x: 10.25, y: 10.25 });
  });

  it("rounds a staircase corner instead of interpolating straight through it", () => {
    const interp = new EntityInterpolator();
    interp.ingest([{ id: 1, x: 0, y: 0 }]); // fresh
    interp.ingest([{ id: 1, x: 1, y: 0 }]); // step E
    interp.ingest([{ id: 1, x: 1, y: 1 }]); // step S — a 90° corner at (1,0)
    // The corner tile (prev) is pinned exactly at behind = 1 (phase 0.5).
    expect(interp.positionOf(1, 0.5, 1, 1)).toEqual({ x: 1, y: 0 });
    // Leaving the corner on the prev→cur half (behind 0.5, phase 1.0), the path
    // carries a little of the incoming E heading (x eases past the tile line)
    // rather than snapping straight down like a linear lerp (which would sit at
    // {1, 0.5}).
    const mid = interp.positionOf(1, 1.0, 1, 1);
    expect(mid.x).toBeGreaterThan(1);
    expect(mid.y).toBeLessThan(0.5);
    expect(mid.x).toBeCloseTo(1.0625, 6);
    expect(mid.y).toBeCloseTo(0.4375, 6);
  });

  it("snaps (does not lerp) on a teleport beyond MAX_LERP_TILES", () => {
    const interp = new EntityInterpolator();
    interp.ingest([{ id: 1, x: 0, y: 0 }]);
    interp.ingest([{ id: 1, x: 0, y: 0 }]); // establish prev==cur, snap clears
    interp.ingest([{ id: 1, x: MAX_LERP_TILES + 5, y: 0 }]); // big jump (load/replay)
    // Any phase must show the CURRENT tile, not a smear across the map.
    expect(interp.positionOf(1, 1, MAX_LERP_TILES + 5, 0)).toEqual({ x: MAX_LERP_TILES + 5, y: 0 });
  });

  it("does not curve off a stale tile after a teleport (buffer stays shallow + linear)", () => {
    const interp = new EntityInterpolator();
    interp.ingest([{ id: 1, x: 0, y: 0 }]);
    interp.ingest([{ id: 1, x: 50, y: 0 }]); // teleport → this segment snaps
    interp.ingest([{ id: 1, x: 51, y: 0 }]); // first post-teleport step
    // The prior segment was a snap, so histValid is false → buffer depth 1, plain
    // linear on prev→cur, never a Catmull tangent leaning on the pre-teleport tile.
    expect(interp.positionOf(1, 1.0, 51, 0)).toEqual({ x: 50.5, y: 0 });
  });

  it("prunes ids absent from the latest snapshot", () => {
    const interp = new EntityInterpolator();
    interp.ingest([{ id: 1, x: 0, y: 0 }, { id: 2, x: 5, y: 5 }]);
    expect(interp.size).toBe(2);
    interp.ingest([{ id: 1, x: 1, y: 0 }]); // id 2 despawned
    expect(interp.size).toBe(1);
    // An unknown id falls back to its passed-in position.
    expect(interp.positionOf(2, 1, 99, 99)).toEqual({ x: 99, y: 99 });
  });

  it("an id that despawns then respawns is snapped, not smeared", () => {
    const interp = new EntityInterpolator();
    interp.ingest([{ id: 1, x: 0, y: 0 }]);
    interp.ingest([]);                       // despawn → pruned
    interp.ingest([{ id: 1, x: 40, y: 40 }]); // reused id, far away → fresh, snap
    expect(interp.positionOf(1, 1, 40, 40)).toEqual({ x: 40, y: 40 });
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

describe("EntityInterpolator — long-segment glide (segmentIntervals > 1, e.g. raider march)", () => {
  it("glides prev→cur across the WHOLE segment, not just the jitter-buffer window", () => {
    const S = 180;
    const interp = new EntityInterpolator(S);
    interp.ingest([{ id: 1, x: 0, y: 0 }]); // fresh → snap
    interp.ingest([{ id: 1, x: 1, y: 0 }]); // real step E: sinceChange resets to 0 here
    // Immediately after the step lands (sinceChange=0, phase=0): still at prev.
    expect(interp.positionOf(1, 0, 1, 0)).toEqual({ x: 0, y: 0 });
    // Repeat the SAME tile for many ticks (the sim hasn't stepped again yet) —
    // each ingest ages sinceChange without touching prev/cur.
    for (let i = 0; i < 89; i++) interp.ingest([{ id: 1, x: 1, y: 0 }]);
    // sinceChange is now 89 (0 at the step + 89 repeats); a = 89/180.
    const mid = interp.positionOf(1, 0, 1, 0);
    expect(mid.x).toBeCloseTo(89 / 180, 6);
    expect(mid.y).toBe(0);
    // Advance to the tick right before the NEXT real step (sinceChange = S-1).
    for (let i = 0; i < 90; i++) interp.ingest([{ id: 1, x: 1, y: 0 }]);
    const nearEnd = interp.positionOf(1, 0, 1, 0);
    expect(nearEnd.x).toBeCloseTo(179 / 180, 6);
  });

  it("reaches cur exactly as the next real step's snapshot lands (seamless handoff)", () => {
    const S = 10;
    const interp = new EntityInterpolator(S);
    interp.ingest([{ id: 1, x: 0, y: 0 }]);
    interp.ingest([{ id: 1, x: 1, y: 0 }]); // step 1: sinceChange=0
    for (let i = 0; i < 9; i++) interp.ingest([{ id: 1, x: 1, y: 0 }]); // sinceChange -> 9
    expect(interp.positionOf(1, 0, 1, 0)).toEqual({ x: 0.9, y: 0 });
    interp.ingest([{ id: 1, x: 2, y: 0 }]); // step 2 lands: sinceChange resets to 0
    // The new segment starts exactly where the old one was heading (1,0) — no snap.
    expect(interp.positionOf(1, 0, 2, 0)).toEqual({ x: 1, y: 0 });
  });

  it("a mid-march snapshot repeating the SAME tile does not reset the glide", () => {
    const S = 20;
    const interp = new EntityInterpolator(S);
    interp.ingest([{ id: 1, x: 0, y: 0 }]);
    interp.ingest([{ id: 1, x: 1, y: 0 }]); // step: sinceChange=0
    for (let i = 0; i < 10; i++) interp.ingest([{ id: 1, x: 1, y: 0 }]); // repeats, sinceChange -> 10
    const before = interp.positionOf(1, 0, 1, 0);
    interp.ingest([{ id: 1, x: 1, y: 0 }]); // one more repeat — must AGE, not reset
    const after = interp.positionOf(1, 0, 1, 0);
    expect(after.x).toBeGreaterThan(before.x);
    expect(after.x).toBeCloseTo(11 / 20, 6);
  });

  it("still snaps (does not lerp) on a teleport beyond MAX_LERP_TILES", () => {
    const interp = new EntityInterpolator(180);
    interp.ingest([{ id: 1, x: 0, y: 0 }]);
    interp.ingest([{ id: 1, x: 0, y: 0 }]);
    interp.ingest([{ id: 1, x: MAX_LERP_TILES + 5, y: 0 }]); // teleport
    expect(interp.positionOf(1, 1, MAX_LERP_TILES + 5, 0)).toEqual({ x: MAX_LERP_TILES + 5, y: 0 });
  });

  it("drops an id that despawns mid-march (pruned, not stuck mid-glide)", () => {
    const interp = new EntityInterpolator(180);
    interp.ingest([{ id: 1, x: 0, y: 0 }]);
    interp.ingest([{ id: 1, x: 1, y: 0 }]); // step, now marching
    for (let i = 0; i < 50; i++) interp.ingest([{ id: 1, x: 1, y: 0 }]); // mid-march
    expect(interp.size).toBe(1);
    interp.ingest([]); // despawned mid-march (e.g. resolved/sacked)
    expect(interp.size).toBe(0);
    expect(interp.positionOf(1, 0, 42, 42)).toEqual({ x: 42, y: 42 });
  });

  it("isMoving stays true for the entire march, not just at the step tick", () => {
    const interp = new EntityInterpolator(180);
    interp.ingest([{ id: 1, x: 0, y: 0 }]);
    interp.ingest([{ id: 1, x: 1, y: 0 }]); // real step
    expect(interp.isMoving(1)).toBe(true);
    for (let i = 0; i < 179; i++) {
      interp.ingest([{ id: 1, x: 1, y: 0 }]); // still marching toward the next step
      expect(interp.isMoving(1)).toBe(true);
    }
  });

  it("a stationary raider (walled off, waiting) reads as not moving", () => {
    const interp = new EntityInterpolator(180);
    interp.ingest([{ id: 1, x: 5, y: 5 }]); // fresh
    interp.ingest([{ id: 1, x: 5, y: 5 }]); // no path — sits in place
    expect(interp.isMoving(1)).toBe(false);
    expect(interp.positionOf(1, 0, 5, 5)).toEqual({ x: 5, y: 5 });
  });

  it("a raider that gets walled off AFTER marching settles (isMoving goes false again, not stuck true)", () => {
    const S = 5; // small S keeps the test fast; the settle logic is size-independent
    const interp = new EntityInterpolator(S);
    interp.ingest([{ id: 1, x: 0, y: 0 }]);
    interp.ingest([{ id: 1, x: 1, y: 0 }]); // real step: now marching, isMoving() true
    expect(interp.isMoving(1)).toBe(true);
    // No further step ever arrives (walled off, no path) — sit at (1,0) well past
    // one full march interval (S=5).
    for (let i = 0; i < S + 3; i++) interp.ingest([{ id: 1, x: 1, y: 0 }]);
    // Settled: prev has caught up to cur, so isMoving() correctly reports idle
    // again instead of leaving the walk-cycle gait running forever.
    expect(interp.isMoving(1)).toBe(false);
    // Position is unaffected by the settle (it was already clamped at cur).
    expect(interp.positionOf(1, 0, 1, 0)).toEqual({ x: 1, y: 0 });
    // If it resumes marching later (a path opens up), the step out of this
    // rest is treated like any first step — no Catmull tangent off the stale
    // pre-siege tile.
    interp.ingest([{ id: 1, x: 2, y: 0 }]);
    expect(interp.isMoving(1)).toBe(true);
    const mid = interp.positionOf(1, 0.5 * S, 2, 0); // halfway through the new step
    expect(mid.x).toBeCloseTo(1.5, 6); // plain linear, not curved
    expect(mid.y).toBe(0);
  });

  it("segmentIntervals=1 (default) is byte-identical to the pre-existing villager behaviour", () => {
    // Sanity check that the default constructor arg reproduces the exact assertions
    // from the jitter-buffer describe block above, guarding against the branch
    // accidentally being taken for the default (villager) case.
    const interp = new EntityInterpolator(1);
    interp.ingest([{ id: 1, x: 0, y: 0 }]);
    interp.ingest([{ id: 1, x: 1, y: 0 }]);
    interp.ingest([{ id: 1, x: 2, y: 0 }]);
    expect(interp.positionOf(1, 0, 2, 0)).toEqual({ x: 0.5, y: 0 });
    expect(interp.positionOf(1, 0.5, 2, 0)).toEqual({ x: 1, y: 0 });
    expect(interp.positionOf(1, 1.5, 2, 0)).toEqual({ x: 2, y: 0 });
  });
});

describe("shouldIngestSnapshot — correction snapshots must not re-ingest a same-tick glide", () => {
  it("always ingests the first snapshot (null sentinel), regardless of its tick", () => {
    expect(shouldIngestSnapshot(null, 0)).toBe(true);
    expect(shouldIngestSnapshot(null, 41)).toBe(true);
  });

  it("does not re-ingest a correction snapshot carrying the SAME tick as the last one ingested", () => {
    // Pause/resume/speed-change/host-migration re-broadcast the current tick's snapshot
    // outside the normal tick cadence; re-ingesting it would shift prev<-cur mid-glide.
    expect(shouldIngestSnapshot(41, 41)).toBe(false);
  });

  it("ingests once a snapshot's tick has actually advanced", () => {
    expect(shouldIngestSnapshot(41, 42)).toBe(true);
  });

  it("ingests a snapshot whose tick moved BACKWARDS — a solo load-save rewinds to the save point", () => {
    // `load-save` sets `tick = save.currentTick`, so loading an older save while the sim
    // is further along walks the tick back. Gating on `tick > last` would freeze every
    // entity until the sim ticked back past the pre-load tick.
    expect(shouldIngestSnapshot(5000, 1000)).toBe(true);
  });
});

describe("snapshotPhase", () => {
  it("returns the full render delay (⇒ drawn at rest at the newest tile) when the interval is unknown", () => {
    expect(snapshotPhase(1000, 900, 0)).toBe(RENDER_DELAY_INTERVALS);
  });

  it("is the elapsed fraction of the interval, NOT clamped above 1 (the buffer absorbs a gap)", () => {
    expect(snapshotPhase(1000, 1000, 50)).toBe(0);   // just arrived
    expect(snapshotPhase(1025, 1000, 50)).toBe(0.5); // halfway
    expect(snapshotPhase(1050, 1000, 50)).toBe(1);   // one interval elapsed
    expect(snapshotPhase(1150, 1000, 50)).toBe(3);   // long gap → keeps climbing
    expect(snapshotPhase(990, 1000, 50)).toBe(0);    // negative clamps to 0
  });
});
