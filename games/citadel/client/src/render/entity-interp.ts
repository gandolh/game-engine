/**
 * Render-only entity position interpolation.
 *
 * The sim steps units (villagers, raiders) one tile per tick and posts an integer
 * tile position in each snapshot, so drawn straight the figures SNAP from tile to
 * tile. This module smooths that on the render side ONLY: it remembers each
 * entity's previous + current snapshot tile position (keyed by id) and, given a
 * render-time fraction `alpha` in [0,1] through the gap between the two latest
 * snapshots, returns a continuously interpolated `{x, y}` in tile space. The
 * caller projects that (fractional tile coords are fine for `isoPointBox`).
 *
 * It NEVER touches the sim or determinism — it reads snapshots + the main-thread
 * render clock and produces only render positions. Edge cases that must NOT smear
 * across the map are SNAPPED instead of lerped:
 *   - a brand-new id (first time we've seen it) → no previous, draw at current;
 *   - a teleport (tile delta beyond `MAX_LERP_TILES`, e.g. load / replay reset or
 *     a despawn+respawn reusing an id) → snap to current;
 *   - an id absent from the latest snapshot → dropped (the caller won't ask).
 *
 * Corner smoothing (brief 104). Sim paths are 4-connected, so a diagonal walk
 * comes down the wire as a staircase (E, S, E, S, …). Straight linear interp
 * turns that into a sharp zig-zag with a 90° flick at every tile — the "moves
 * unnatural on the road" read. To fix it WITHOUT touching the sim, we keep one
 * extra history tile (`prevPrev`) and drive the current `prev → cur` segment with
 * a Catmull-Rom / Hermite spline whose start tangent leans on `prevPrev` — so a
 * unit rounds the corner instead of snapping around it. The spline is exactly
 * linear on a straight run (collinear points ⇒ chord tangents ⇒ a straight line)
 * and only bends where the path actually turns; the end tangent is clamped to the
 * segment direction because we render one snapshot behind and do NOT know the
 * NEXT tile yet. Only enabled when the preceding segment was a real, non-snap
 * walked step (`histValid`); the first step out of rest, and any segment after a
 * teleport, stay linear so nothing curves off a stale pre-teleport tile.
 *
 * `alpha` is supplied by the caller from the *measured* interval between the last
 * two snapshot arrivals (snapshots pace at 1000/(20·speed) ms, so the interval
 * shrinks as the player speeds up); measuring rather than assuming a fixed period
 * keeps the glide correct across 1×/2×/4× and snapshot jitter.
 */

/** Minimal shape this module needs from an entity snapshot. */
export interface InterpEntity {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

/** An interpolated tile-space position. */
export interface InterpPos {
  x: number;
  y: number;
}

/**
 * A tile delta (Chebyshev) larger than this between two consecutive snapshots is
 * treated as a teleport, not movement, and snapped. A unit walks ≤1 tile/tick, so
 * anything beyond a small slack is a reset/respawn, never a real step.
 */
export const MAX_LERP_TILES = 2;

interface Track {
  /** Tile one step BEFORE `prev` — the incoming direction for corner smoothing. */
  prevPrevX: number;
  prevPrevY: number;
  prevX: number;
  prevY: number;
  curX: number;
  curY: number;
  /** True when prev→cur is a teleport (snap, don't lerp). */
  snap: boolean;
  /**
   * True when `prevPrev → prev` was a genuine walked step (moved, not a snap), so
   * its direction is a trustworthy input for the Catmull-Rom start tangent. False
   * on the first step out of rest and on the step after a teleport → those
   * segments interpolate linearly (no corner curve off a stale tile).
   */
  histValid: boolean;
}

/**
 * Per-entity-set interpolator. Construct one per logical set (villagers, raiders)
 * so ids never collide across sets. Stateful but render-only.
 */
export class EntityInterpolator {
  private readonly tracks = new Map<number, Track>();

  /**
   * Ingest a new snapshot's entities: shift each known id's current→previous and
   * record the new current; seed brand-new ids with prev==cur (so they sit still
   * until they actually move). Prune ids absent from this snapshot. Call once per
   * NEW snapshot (not per render frame).
   */
  ingest(entities: readonly InterpEntity[]): void {
    const present = new Set<number>();
    for (const e of entities) {
      present.add(e.id);
      const t = this.tracks.get(e.id);
      if (t === undefined) {
        // New id: no history → draw at its position (prev == cur).
        this.tracks.set(e.id, {
          prevPrevX: e.x, prevPrevY: e.y,
          prevX: e.x, prevY: e.y,
          curX: e.x, curY: e.y,
          snap: true, histValid: false,
        });
        continue;
      }
      // The OLD prev→cur segment becomes the new prevPrev→prev segment; capture
      // whether it was a real walked step BEFORE shifting, so the next segment
      // knows if its start tangent (leaning on prevPrev) is trustworthy.
      const oldMoved = t.prevX !== t.curX || t.prevY !== t.curY;
      const oldSnap = t.snap;
      t.prevPrevX = t.prevX;
      t.prevPrevY = t.prevY;
      t.prevX = t.curX;
      t.prevY = t.curY;
      t.curX = e.x;
      t.curY = e.y;
      const d = Math.max(Math.abs(t.curX - t.prevX), Math.abs(t.curY - t.prevY));
      t.snap = d > MAX_LERP_TILES;
      t.histValid = oldMoved && !oldSnap;
    }
    for (const id of this.tracks.keys()) {
      if (!present.has(id)) this.tracks.delete(id);
    }
  }

  /**
   * Interpolated tile position for `id` at render fraction `alpha` (0..1 through
   * the gap between the two latest snapshots). Falls back to `(fx, fy)` if the id
   * is unknown (it should be present after `ingest`). Snaps to current when the
   * last step was a teleport or the id is fresh.
   */
  positionOf(id: number, alpha: number, fx: number, fy: number): InterpPos {
    const t = this.tracks.get(id);
    if (t === undefined) return { x: fx, y: fy };
    if (t.snap) return { x: t.curX, y: t.curY };
    const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;

    // Segment (chord) direction — also the END tangent (we don't know the next
    // tile yet, so the segment arrives heading straight along itself).
    const dx = t.curX - t.prevX;
    const dy = t.curY - t.prevY;

    // Start tangent. With trustworthy history it's the Catmull-Rom tangent
    // (prevPrev → cur)/2, which bends the exit off a corner; otherwise it's the
    // chord itself, so the segment stays exactly linear (no curve off a stale or
    // just-spawned tile). Collinear points make both tangents the chord ⇒ the
    // Hermite reduces to a straight line on open road.
    const m1x = t.histValid ? (t.curX - t.prevPrevX) * 0.5 : dx;
    const m1y = t.histValid ? (t.curY - t.prevPrevY) * 0.5 : dy;

    // Cubic Hermite basis on [0,1]. h01/h11 fold in so the result is p1 + a·chord
    // when both tangents equal the chord (the straight-road / no-history case).
    const a2 = a * a;
    const a3 = a2 * a;
    const h00 = 2 * a3 - 3 * a2 + 1;
    const h10 = a3 - 2 * a2 + a;
    const h01 = -2 * a3 + 3 * a2;
    const h11 = a3 - a2;
    return {
      x: h00 * t.prevX + h10 * m1x + h01 * t.curX + h11 * dx,
      y: h00 * t.prevY + h10 * m1y + h01 * t.curY + h11 * dy,
    };
  }

  /**
   * Whether `id` is moving this snapshot gap — its previous and current tiles
   * differ and the step wasn't a teleport (so it's a real walk, not a respawn).
   * Drives the walk-vs-idle gait. Unknown ids read as not moving.
   */
  isMoving(id: number): boolean {
    const t = this.tracks.get(id);
    if (t === undefined || t.snap) return false;
    return t.prevX !== t.curX || t.prevY !== t.curY;
  }

  /** Number of tracked entities (test/diagnostic helper). */
  get size(): number {
    return this.tracks.size;
  }
}

/**
 * Compute the render fraction `alpha` (0..1) through the gap between the two most
 * recent snapshots, from the render clock. Pure.
 *
 * @param nowMs           current render clock (performance.now)
 * @param lastSnapshotMs  render clock when the latest snapshot arrived
 * @param intervalMs      measured ms between the last two snapshot arrivals
 *
 * Returns 1 (fully at the latest snapshot) when the interval is unknown/zero, so
 * a single snapshot or a stall draws the entity at rest rather than mid-lerp.
 */
export function snapshotAlpha(nowMs: number, lastSnapshotMs: number, intervalMs: number): number {
  if (intervalMs <= 0) return 1;
  const a = (nowMs - lastSnapshotMs) / intervalMs;
  return a < 0 ? 0 : a > 1 ? 1 : a;
}
