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
 * Render-delay JITTER BUFFER (2026-07-16). The Worker does NOT deliver snapshots
 * on a clean 50ms metronome: measured in-browser over ~700 arrivals the interval
 * ranged 0.2ms→88ms around a 50ms mean (p90=64, p99=76) — setInterval coalescing +
 * postMessage/serialization batches them into bursts and gaps. The earlier scheme
 * raced `alpha` from prev→cur straight at the NEWEST snapshot with no buffer, so on
 * the ~41% of gaps where the next snapshot arrived later than the smoothed interval,
 * a unit reached its target tile and HELD there (avg ~11ms, up to ~38ms) until the
 * late snapshot landed, then jumped — that per-tile hold-then-jump is the visible
 * tile-stepping. The fix (matching Farm Valley's client, which buffers identically
 * over its jittery WebSocket) is to render `RENDER_DELAY_INTERVALS` snapshots BEHIND
 * the newest, so we only ever interpolate between snapshots that have BOTH already
 * arrived — a late or bursty next snapshot never gates the current glide. The cost
 * is a fixed ~2-interval (~100ms at 1×) latency, uniform across every entity, which
 * is invisible in a watch-it-play sim (Farm carries the same 2-tick delay).
 *
 * `phase` (supplied by the caller) is the elapsed fraction of the *measured*
 * interval since the newest snapshot arrived — 0 just as it lands, 1 as the next is
 * due, and it keeps climbing past 1 during a gap. It maps to how far BEHIND the
 * newest we draw: `behind = RENDER_DELAY_INTERVALS - phase`, where the newest tile
 * sits at behind 0, `prev` at 1, `prevPrev` at 2. We interpolate the two history
 * tiles bracketing `behind`, so as `phase` runs 0→1 the unit glides prevPrev→prev,
 * and only if a gap stretches past the whole buffer (phase>2, i.e. >~100ms) does it
 * clamp/hold at the newest tile. Measuring the interval (rather than assuming a
 * fixed period) still keeps the glide correct across 1×/2×/4× and jitter.
 *
 * Corner smoothing (brief 104). Sim paths are 4-connected, so a diagonal walk
 * comes down the wire as a staircase (E, S, E, S, …). Straight linear interp
 * turns that into a sharp zig-zag with a 90° flick at every tile — the "moves
 * unnatural on the road" read. To fix it WITHOUT touching the sim we drive each
 * segment with a Catmull-Rom / Hermite spline whose tangents lean on the
 * neighbouring tiles, so a unit rounds the corner instead of snapping around it.
 * The spline is exactly linear on a straight run (collinear points ⇒ chord
 * tangents ⇒ a straight line) and only bends where the path actually turns.
 * Because the render-delay buffer draws one segment behind, the buffered
 * `prevPrev → prev` segment now knows BOTH its neighbours (`prevPrev-1` is absent so
 * its start tangent is the chord, but `cur` — the tile AFTER `prev` — supplies a
 * true Catmull end tangent), so the corner at `prev` rounds from both sides.
 * Reaching back into that buffered segment is gated on the preceding step being a
 * real, non-snap walked step (`histValid`); the first step out of rest, and any
 * segment after a teleport, keep the shallow (prev→cur only) buffer so nothing
 * curves off a stale pre-teleport tile.
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

/**
 * How many snapshots BEHIND the newest we render (the jitter-buffer depth), in
 * interval units. Drawing in the past lets every segment interpolate between two
 * snapshots that have ALREADY arrived, so a late/bursty next snapshot can't force
 * a hold (the tile-stepping). It reads from the three history tiles the
 * interpolator keeps: newest at behind 0, `prev` at 1, `prevPrev` at 2.
 *
 * 1.5 is tuned for the MEASURED worker jitter (interval mean 50ms, p99 76ms): a
 * hold only recurs when a gap exceeds 1.5× the interval (~75ms), which dropped the
 * hold rate from ~41% to ~2% in the diagnosis. It also keeps the latency close to
 * the pre-buffer scheme — a hair under one interval on average (behind ∈ [0.5,1.5]
 * across a steady interval) — so villagers don't vanish into buildings a couple of
 * tiles early on Citadel's short cozy-town paths (Farm uses 2 over its jittery
 * WebSocket, but its paths are longer). Larger = smoother under worse jitter but
 * more latency; smaller reintroduces the hold-then-jump stepping.
 */
export const RENDER_DELAY_INTERVALS = 1.5;

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
   * Interpolated tile position for `id` at render `phase` (elapsed fraction of the
   * measured interval since the newest snapshot; 0 as it lands, ~1 as the next is
   * due, climbing past 1 during a gap). Falls back to `(fx, fy)` if the id is
   * unknown (it should be present after `ingest`). Snaps to current when the last
   * step was a teleport or the id is fresh.
   *
   * Renders `RENDER_DELAY_INTERVALS` snapshots behind the newest (the jitter
   * buffer): `behind = RENDER_DELAY_INTERVALS - phase` is how far back we draw, so
   * we interpolate whichever pair of history tiles brackets `behind` — always two
   * that have already arrived. `behind` is clamped into the tiles we actually hold
   * (newest=0, prev=1, prevPrev=2), and only reaches into the buffered
   * `prevPrev → prev` segment when that step was a real walked one (`histValid`).
   */
  positionOf(id: number, phase: number, fx: number, fy: number): InterpPos {
    const t = this.tracks.get(id);
    if (t === undefined) return { x: fx, y: fy };
    if (t.snap) return { x: t.curX, y: t.curY };

    const p = phase < 0 ? 0 : phase;
    // Only reach back into the prevPrev→prev segment on a clean walked step;
    // otherwise a teleport/spawn sits at prevPrev and extending into it would
    // smear, so keep the shallow prev→cur-only buffer (depth 1).
    const maxBehind = t.histValid ? 2 : 1;
    let behind = RENDER_DELAY_INTERVALS - p;
    if (behind < 0) behind = 0;
    if (behind > maxBehind) behind = maxBehind;

    if (behind <= 1) {
      // Segment prev → cur, local fraction a = 1 - behind (0 at prev, 1 at cur).
      // End tangent is the chord (the tile after cur is unknown); start tangent
      // leans on prevPrev (Catmull) with trustworthy history, else the chord.
      const dx = t.curX - t.prevX;
      const dy = t.curY - t.prevY;
      const m0x = t.histValid ? (t.curX - t.prevPrevX) * 0.5 : dx;
      const m0y = t.histValid ? (t.curY - t.prevPrevY) * 0.5 : dy;
      return hermite(t.prevX, t.prevY, t.curX, t.curY, m0x, m0y, dx, dy, 1 - behind);
    }
    // Buffered segment prevPrev → prev, local fraction a = 2 - behind (0 at
    // prevPrev, 1 at prev). Start tangent is the chord (no tile before prevPrev);
    // end tangent is the Catmull tangent (cur − prevPrev)/2 — `cur` is the KNOWN
    // tile after `prev` (and prev→cur is a non-snap step, checked above), so the
    // corner at `prev` rounds from both sides. Collinear ⇒ both tangents are the
    // chord ⇒ a straight line.
    const chordX = t.prevX - t.prevPrevX;
    const chordY = t.prevY - t.prevPrevY;
    const m1x = (t.curX - t.prevPrevX) * 0.5;
    const m1y = (t.curY - t.prevPrevY) * 0.5;
    return hermite(t.prevPrevX, t.prevPrevY, t.prevX, t.prevY, chordX, chordY, m1x, m1y, 2 - behind);
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
 * Cubic Hermite interpolation of a 2D point on the segment p0→p1 with endpoint
 * tangents (m0, m1), at local parameter a∈[0,1]. Pure. h01/h11 fold in so the
 * result is p0 + a·(p1−p0) when both tangents equal the chord (the straight-road
 * case), i.e. the spline reduces to a straight line on open road.
 */
function hermite(
  p0x: number, p0y: number, p1x: number, p1y: number,
  m0x: number, m0y: number, m1x: number, m1y: number,
  a: number,
): InterpPos {
  const a2 = a * a;
  const a3 = a2 * a;
  const h00 = 2 * a3 - 3 * a2 + 1;
  const h10 = a3 - 2 * a2 + a;
  const h01 = -2 * a3 + 3 * a2;
  const h11 = a3 - a2;
  return {
    x: h00 * p0x + h10 * m0x + h01 * p1x + h11 * m1x,
    y: h00 * p0y + h10 * m0y + h01 * p1y + h11 * m1y,
  };
}

/**
 * Compute the render `phase` for {@link EntityInterpolator.positionOf}: the
 * elapsed fraction of the measured interval since the newest snapshot arrived.
 * Pure. NOT clamped above 1 — during a gap it keeps climbing, and positionOf's
 * render-delay buffer turns that into "how far behind the newest to draw", only
 * holding once the gap outlasts the whole buffer.
 *
 * @param nowMs           current render clock (performance.now)
 * @param lastSnapshotMs  render clock when the latest snapshot arrived
 * @param intervalMs      measured ms between the last two snapshot arrivals
 *
 * Returns {@link RENDER_DELAY_INTERVALS} (⇒ drawn at the newest tile, at rest)
 * when the interval is unknown/zero, so a single snapshot or a stall draws the
 * entity at its current tile rather than mid-lerp.
 */
export function snapshotPhase(nowMs: number, lastSnapshotMs: number, intervalMs: number): number {
  if (intervalMs <= 0) return RENDER_DELAY_INTERVALS;
  const p = (nowMs - lastSnapshotMs) / intervalMs;
  return p < 0 ? 0 : p;
}

/**
 * Whether a newly-arrived snapshot should be fed into interpolation state (`ingest` +
 * the `lastSnapshotMs`/interval bookkeeping around it). Citadel 97/13 pause/resume/
 * speed-change/host-migration corrections re-broadcast the snapshot for the CURRENT
 * tick outside the normal tick cadence (nothing ticks while paused, so a correction
 * can't ride a tick) — re-ingesting one mid-glide would shift prev←cur and truncate
 * the glide, hopping the entity forward. `lastIngestedTick === null` is the "nothing
 * ingested yet" sentinel, so the very first snapshot always ingests.
 *
 * The test is `!==`, not `>`: a solo load-save rewinds the sim to the save point
 * (`tick = save.currentTick`), so loading an older save moves the tick BACKWARDS. That
 * is genuinely new state and must ingest — under `>` it never would, freezing every
 * entity until the sim ticked back past the pre-load tick. Only an identical tick means
 * "a correction re-broadcast of a snapshot already ingested".
 */
export function shouldIngestSnapshot(lastIngestedTick: number | null, tick: number): boolean {
  return lastIngestedTick === null || tick !== lastIngestedTick;
}
