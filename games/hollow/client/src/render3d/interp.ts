/**
 * Render-only snapshot interpolation (chunk hollow-09a). The sim steps
 * agents on an integer tile grid once per tick, so drawn straight, agents
 * (09b) and any prop tied to their position would SNAP tile-to-tile. This
 * module smooths that on the render side only — it never touches the sim,
 * never reads/writes anything the sim itself decides from (see CLAUDE.md's
 * sim/render boundary + "determinism is load-bearing"). Reference: Citadel's
 * `entity-interp.ts` (`EntityInterpolator`/render-delay jitter buffer) — this
 * is a deliberately SIMPLER single-interval version, sufficient for 09a's
 * needs (camera framing, node/home layout stability) and 09b's walk cycle;
 * if 09b's gait needs Citadel's fuller corner-smoothing/jitter-buffer
 * treatment, it can layer that on top of (or replace) `SnapshotBuffer`
 * without changing the pure `lerpAgentPositions` contract below.
 *
 * "Never extrapolate" contract: {@link SnapshotBuffer.alpha} is clamped to
 * `[0, 1]` — once the render clock runs past the latest known snapshot's
 * arrival by a full measured tick interval (e.g. a stalled Worker), motion
 * HOLDS at the latest snapshot rather than projecting forward into unknown
 * state.
 */
import type { HollowAgentSnapshot, HollowSnapshot } from "@hollow/sim-core/sim-bootstrap";

/** Minimal shape {@link lerpAgentPositions} needs from a snapshot agent —
 *  structural, not tied to the full `HollowAgentSnapshot` shape, so tests
 *  can pass plain literals. */
export interface InterpAgentLike {
  readonly id: number;
  readonly gx: number;
  readonly gy: number;
}

/** An interpolated grid-space position (fractional tile coordinates). */
export interface InterpPos {
  readonly x: number;
  readonly y: number;
}

/**
 * Pure: linearly interpolate every agent present in `next` between its
 * `prev` position (if any) and its `next` position, at `alpha` (clamped to
 * `[0, 1]`). An id present in `next` but not `prev` (brand new this
 * snapshot — just born, or the very first snapshot) SNAPS to its `next`
 * position regardless of `alpha` — there is no history to lerp from, and
 * smearing in from an arbitrary origin (e.g. (0,0)) would look like a
 * teleport-in-reverse. An id present in `prev` but absent from `next`
 * (despawned) is simply not emitted.
 */
export function lerpAgentPositions(
  prev: readonly InterpAgentLike[],
  next: readonly InterpAgentLike[],
  alpha: number,
): Map<number, InterpPos> {
  const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  const prevById = new Map<number, InterpAgentLike>();
  for (const p of prev) prevById.set(p.id, p);

  const out = new Map<number, InterpPos>();
  for (const n of next) {
    const p = prevById.get(n.id);
    if (!p) {
      out.set(n.id, { x: n.gx, y: n.gy });
      continue;
    }
    out.set(n.id, { x: p.gx + (n.gx - p.gx) * a, y: p.gy + (n.gy - p.gy) * a });
  }
  return out;
}

/**
 * Stateful (render-only) buffer that keeps the latest two `HollowSnapshot`s
 * the client has received from the Worker and produces a smoothly
 * interpolated agent-position map for any wall-clock render time. Call
 * `ingest` once per NEW snapshot message (not per render frame); call
 * `interpolatedAgentPositions`/`alpha` once per rAF frame.
 */
export class SnapshotBuffer {
  private prev: HollowSnapshot | null = null;
  private latest: HollowSnapshot | null = null;
  private latestAtMs = 0;
  /** Measured ms between the last two snapshot arrivals — seeds `alpha`'s
   *  denominator; refined on every `ingest` after the first. */
  private intervalMs = 1000 / 20; // matches the worker's 20 Hz default until measured

  /** Feed a freshly-arrived snapshot. `nowMs` is the render clock
   *  (`performance.now()`), NEVER a sim tick. */
  ingest(snapshot: HollowSnapshot, nowMs: number): void {
    if (this.latest) {
      this.prev = this.latest;
      const measured = nowMs - this.latestAtMs;
      if (measured > 0) this.intervalMs = measured;
    }
    this.latest = snapshot;
    this.latestAtMs = nowMs;
  }

  /** The most recently ingested snapshot, or `null` before the first one
   *  arrives. Non-interpolated fields (tick, communities, resourceNodes'
   *  stock, etc.) read straight from this — only per-agent POSITION needs
   *  smoothing (see `interpolatedAgentPositions`). */
  getLatest(): HollowSnapshot | null {
    return this.latest;
  }

  /** Elapsed fraction of the measured inter-snapshot interval since
   *  `latest` arrived, clamped to `[0, 1]` (the "never extrapolate"
   *  contract — see this module's header). Returns `1` (draw exactly at
   *  `latest`, no smoothing) until a second snapshot has arrived. */
  alpha(nowMs: number): number {
    if (!this.prev || !this.latest || this.intervalMs <= 0) return 1;
    const raw = (nowMs - this.latestAtMs) / this.intervalMs;
    return raw < 0 ? 0 : raw > 1 ? 1 : raw;
  }

  /** Interpolated per-agent grid position at the current render time — the
   *  accessor 09b's humanoid draws (and 09a's own camera/prop smoothing)
   *  consume. Empty map before the first snapshot arrives. */
  interpolatedAgentPositions(nowMs: number): Map<number, InterpPos> {
    if (!this.latest) return new Map();
    if (!this.prev) {
      return new Map(this.latest.agents.map((a: HollowAgentSnapshot) => [a.id, { x: a.gx, y: a.gy }]));
    }
    return lerpAgentPositions(this.prev.agents, this.latest.agents, this.alpha(nowMs));
  }

  /** A fractional sim-tick estimate at the current render time — `prev.tick`
   *  eased toward `latest.tick` by `alpha`. Used for smooth (not
   *  once-per-tick-stepped) day/night phase — see `day-night.ts`'s header.
   *  Returns `latest.tick` exactly (no smoothing possible yet) before a
   *  second snapshot has arrived, and `0` before the first. */
  interpolatedTick(nowMs: number): number {
    if (!this.latest) return 0;
    if (!this.prev) return this.latest.tick;
    return this.prev.tick + (this.latest.tick - this.prev.tick) * this.alpha(nowMs);
  }
}
