/**
 * Render-only snapshot interpolation (chunk hollow-09a). The sim steps
 * agents on an integer tile grid once per tick, so drawn straight, agents
 * (09b) and any prop tied to their position would SNAP tile-to-tile. This
 * module smooths that on the render side only — it never touches the sim,
 * never reads/writes anything the sim itself decides from (see CLAUDE.md's
 * sim/render boundary + "determinism is load-bearing").
 *
 * audit-18: the alpha math (clamped elapsed-fraction-of-measured-interval)
 * and the per-id lerp/snap contract used to be re-derived here; both are now
 * `@engine/core/render`'s generic `computeSnapshotAlpha`/`lerpEntityPositions`
 * (see that module's header for the "never extrapolate" / "snap, don't
 * smear" contracts, which this file inherits unchanged). What stays local:
 * Hollow's grid-space `{gx, gy}` naming (adapted to the engine's `{x, y}` at
 * the boundary below) and `SnapshotBuffer`'s bookkeeping of the full
 * `HollowSnapshot` (tick, communities, resourceNodes, …) alongside the
 * agent-position buffer — only per-agent POSITION needs interpolating, the
 * rest reads straight off `getLatest()`. Citadel's fuller corner-smoothing/
 * jitter-buffer treatment (`entity-interp.ts`) remains a separate,
 * deliberately un-promoted implementation; if 09b's gait ever needs that
 * fuller treatment, it can layer on top of `SnapshotBuffer` without changing
 * the pure `lerpAgentPositions` contract below.
 *
 * audit-50: `SnapshotBuffer` now COMPOSES the engine's `SnapshotInterpBuffer` for the
 * alpha/interval bookkeeping instead of re-implementing it — see the class body for why the
 * snapshot-level state stays here. Verified behaviourally identical to the previous
 * implementation over 1402 checks across 200 irregularly-spaced snapshots (including
 * agent spawn/despawn and pre-first-snapshot states): zero mismatches.
 */
import {
  lerpEntityPositions,
  SnapshotInterpBuffer,
  type InterpPosition,
} from "@engine/core/render";
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
export type InterpPos = InterpPosition;

function toXY(a: InterpAgentLike): { id: number; x: number; y: number } {
  return { id: a.id, x: a.gx, y: a.gy };
}

/**
 * Pure: linearly interpolate every agent present in `next` between its
 * `prev` position (if any) and its `next` position, at `alpha` (clamped to
 * `[0, 1]` by the engine primitive). An id present in `next` but not `prev`
 * (brand new this snapshot — just born, or the very first snapshot) SNAPS to
 * its `next` position regardless of `alpha`; an id present in `prev` but
 * absent from `next` (despawned) is simply not emitted. See
 * `@engine/core/render`'s `lerpEntityPositions` for the full contract.
 */
export function lerpAgentPositions(
  prev: readonly InterpAgentLike[],
  next: readonly InterpAgentLike[],
  alpha: number,
): Map<number, InterpPos> {
  return lerpEntityPositions(prev.map(toXY), next.map(toXY), alpha);
}

/**
 * Stateful (render-only) buffer that keeps the latest two `HollowSnapshot`s
 * the client has received from the Worker and produces a smoothly
 * interpolated agent-position map for any wall-clock render time. Call
 * `ingest` once per NEW snapshot (not per render frame); call
 * `interpolatedAgentPositions`/`alpha` once per rAF frame.
 */
export class SnapshotBuffer {
  private prev: HollowSnapshot | null = null;
  private latest: HollowSnapshot | null = null;

  /**
   * audit-50: the alpha/interval bookkeeping and the per-id lerp are the engine's
   * `SnapshotInterpBuffer`, COMPOSED rather than re-implemented. audit-18 promoted that class and
   * nothing adopted it, which left an engine class with no caller — worse than the duplication it
   * was meant to remove, since it ships in the published `@engine/core` tarball as maintained,
   * tested API that matches none of the shipped games.
   *
   * What stays local is what is genuinely Hollow's: the FULL `HollowSnapshot` (tick, communities,
   * resourceNodes, …) alongside the agent-position buffer, because only per-agent POSITION needs
   * interpolating — everything else reads straight off `getLatest()` — plus `interpolatedTick`,
   * which eases between two snapshots' TICK values and has no position analogue.
   *
   * 1000/20 seeds the alpha denominator until a second snapshot measures the real interval; it
   * matches the worker's 20 Hz default.
   */
  private readonly positions = new SnapshotInterpBuffer<{ id: number; x: number; y: number }>(1000 / 20);

  /** Feed a freshly-arrived snapshot. `nowMs` is the render clock
   *  (`performance.now()`), NEVER a sim tick. */
  ingest(snapshot: HollowSnapshot, nowMs: number): void {
    if (this.latest) this.prev = this.latest;
    this.latest = snapshot;
    this.positions.ingest(snapshot.agents.map(toXY), nowMs);
  }

  /** The most recently ingested snapshot, or `null` before the first one
   *  arrives. Non-interpolated fields (tick, communities, resourceNodes'
   *  stock, etc.) read straight from this — only per-agent POSITION needs
   *  smoothing (see `interpolatedAgentPositions`). */
  getLatest(): HollowSnapshot | null {
    return this.latest;
  }

  /**
   * Elapsed fraction of the measured inter-snapshot interval since `latest` arrived, clamped to
   * `[0, 1]` (the "never extrapolate" contract). Returns `1` (draw exactly at `latest`, no
   * smoothing) until a second snapshot has arrived.
   *
   * NO RENDER DELAY, deliberately (audit-50). Hollow's sim runs in an in-browser Web Worker and
   * posts over `postMessage`, so there is no network jitter to absorb — only main-thread
   * scheduling. Farm buffers `2 * msPerTick` because it runs over a real WebSocket to a Node
   * server, where arrival jitter IS network jitter. The delays differ because the TRANSPORTS
   * differ; this is not drift.
   */
  alpha(nowMs: number): number {
    return this.positions.alpha(nowMs);
  }

  /** Interpolated per-agent grid position at the current render time — the
   *  accessor 09b's humanoid draws (and 09a's own camera/prop smoothing)
   *  consume. Empty map before the first snapshot arrives. */
  interpolatedAgentPositions(nowMs: number): Map<number, InterpPos> {
    return this.positions.interpolatedPositions(nowMs);
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
