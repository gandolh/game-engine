/**
 * Generic snapshot-interpolation primitive (audit-18) — promoted out of
 * independent per-game re-derivations of the same problem: keep the last two
 * snapshots, derive a clamped `[0, 1]` alpha from the render clock and the
 * measured/expected inter-arrival interval, and lerp each entity by id.
 * Render-side only: it never touches the sim, never reads/writes anything
 * the sim itself decides from (see CLAUDE.md's sim/render boundary +
 * "determinism is load-bearing" — `nowMs` here is always a render-clock
 * timestamp such as `performance.now()`, never a sim tick).
 *
 * "Never extrapolate" contract: every alpha this module produces is clamped
 * to `[0, 1]` — once the render clock runs past the latest known snapshot by
 * a full measured interval (a stalled connection/Worker), motion HOLDS at
 * the latest snapshot rather than projecting forward into unknown state.
 *
 * "Snap, don't smear" contract: an id present in the newer snapshot but
 * absent from the older one (just spawned, or the very first snapshot ever
 * seen) SNAPS to its latest position regardless of alpha — there is no
 * history to lerp from, and smearing in from an arbitrary origin (e.g.
 * `(0, 0)`) would look like a teleport-in-reverse. An id present in the
 * older snapshot but absent from the newer one (despawned) is simply not
 * emitted.
 *
 * Deliberately NOT here: easing curves (see `@engine/core/animation`'s
 * `smoothstep` and friends), distance-based re-snap thresholds, hitstop/
 * freeze overrides, jitter buffers, or corner smoothing. Those are
 * game-specific game-feel decisions layered on top by the consuming client —
 * this module only knows about ids and x/y.
 */

/** Minimal shape this module needs from an entity — structural, so callers
 *  can pass their own snapshot-entity type directly without adapting it,
 *  as long as it carries a numeric `id`, `x` and `y`. */
export interface InterpEntityLike {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

/** An interpolated position. */
export interface InterpPosition {
  readonly x: number;
  readonly y: number;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Clamp a fraction to `[0, 1]`. */
export function clampAlpha(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * Elapsed fraction of `intervalMs` since `arrivalMs`, offset by an optional
 * `delayMs` (a fixed render-behind-arrival buffer some transports use to
 * smooth out jitter — pass `0` to interpolate right up to the latest
 * snapshot). Clamped to `[0, 1]`; see module header for the "never
 * extrapolate" contract. `intervalMs <= 0` (no measured interval yet, or a
 * degenerate one) returns `1` rather than dividing by zero.
 */
export function computeSnapshotAlpha(
  nowMs: number,
  arrivalMs: number,
  intervalMs: number,
  delayMs = 0,
): number {
  if (intervalMs <= 0) return 1;
  return clampAlpha((nowMs - arrivalMs - delayMs) / intervalMs);
}

/**
 * Pure: linearly interpolate every entity present in `next` between its
 * `prev` position (if any) and its `next` position, at `alpha` (clamped to
 * `[0, 1]`). See module header for the snap/despawn contract.
 */
export function lerpEntityPositions<T extends InterpEntityLike>(
  prev: readonly T[],
  next: readonly T[],
  alpha: number,
): Map<number, InterpPosition> {
  const a = clampAlpha(alpha);
  const prevById = new Map<number, T>();
  for (const p of prev) prevById.set(p.id, p);

  const out = new Map<number, InterpPosition>();
  for (const n of next) {
    const p = prevById.get(n.id);
    if (p === undefined) {
      out.set(n.id, { x: n.x, y: n.y });
      continue;
    }
    out.set(n.id, { x: lerp(p.x, n.x, a), y: lerp(p.y, n.y, a) });
  }
  return out;
}

/**
 * Stateful buffer that keeps the latest two snapshots of `T[]` a client has
 * received and produces smoothly interpolated per-id positions for any
 * wall-clock render time. Call {@link ingest} once per NEW snapshot (not per
 * render frame); call {@link alpha}/{@link interpolatedPositions} once per
 * render frame.
 */
export class SnapshotInterpBuffer<T extends InterpEntityLike> {
  private prevEntities: readonly T[] | null = null;
  private latestEntities: readonly T[] | null = null;
  private latestAtMs = 0;
  private intervalMs: number;

  /** `initialIntervalMs` seeds the alpha denominator before a second
   *  snapshot has arrived to measure it — pass the expected tick/snapshot
   *  rate (e.g. `1000 / hz`). */
  constructor(initialIntervalMs: number) {
    this.intervalMs = initialIntervalMs;
  }

  /** Feed a freshly-arrived snapshot's entities. `nowMs` is the render clock
   *  (e.g. `performance.now()`), NEVER a sim tick. */
  ingest(entities: readonly T[], nowMs: number): void {
    if (this.latestEntities !== null) {
      this.prevEntities = this.latestEntities;
      const measured = nowMs - this.latestAtMs;
      if (measured > 0) this.intervalMs = measured;
    }
    this.latestEntities = entities;
    this.latestAtMs = nowMs;
  }

  /** Discards buffered history without disturbing the measured interval —
   *  for a tab-hidden/reconnect edge where the next snapshot shouldn't lerp
   *  in from stale data. */
  reset(): void {
    this.prevEntities = null;
    this.latestEntities = null;
  }

  /** The most recently ingested snapshot's entities, or `null` before the
   *  first one arrives. */
  getLatest(): readonly T[] | null {
    return this.latestEntities;
  }

  /** The previously ingested snapshot's entities, or `null` before a second
   *  snapshot has arrived. */
  getPrev(): readonly T[] | null {
    return this.prevEntities;
  }

  /** See {@link computeSnapshotAlpha}. Returns `1` (draw exactly at
   *  `latest`, no smoothing) until a second snapshot has arrived. */
  alpha(nowMs: number, delayMs = 0): number {
    if (this.prevEntities === null || this.latestEntities === null) return 1;
    return computeSnapshotAlpha(nowMs, this.latestAtMs, this.intervalMs, delayMs);
  }

  /** Interpolated per-id position at the current render time. Empty map
   *  before the first snapshot arrives; snaps to `latest` positions (no
   *  smoothing) before a second snapshot has arrived. */
  interpolatedPositions(nowMs: number, delayMs = 0): Map<number, InterpPosition> {
    const latest = this.latestEntities;
    if (latest === null) return new Map();
    if (this.prevEntities === null) {
      return new Map(latest.map((e) => [e.id, { x: e.x, y: e.y }]));
    }
    return lerpEntityPositions(this.prevEntities, latest, this.alpha(nowMs, delayMs));
  }
}
