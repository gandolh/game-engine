/**
 * Citadel 22 — incremental build queue with a per-frame budget.
 *
 * Lineage: tiny-world-builder drains a `pendingGhostBoards` queue with a small
 * per-frame budget, and gates enqueue work so panning never triggers a
 * synchronous rebuild. This is the generic, testable core: a de-duplicated work
 * queue you `enqueue` into (cheaply, idempotently) and `drain(budget)` once per
 * frame, so heavy geometry/bake rebuilds (re-bake on placement, future terrain
 * streaming) spread across frames and never hitch on a pan.
 *
 * Render-only; if it ever feeds something sim-visible, drain in FIFO order
 * (it does) so the result is deterministic.
 */
export class IncrementalQueue<T> {
  private readonly queue: T[] = [];
  private readonly pending = new Set<string>();

  /** @param keyOf stable key per item — used to coalesce duplicate enqueues. */
  constructor(private readonly keyOf: (item: T) => string) {}

  /** Number of items waiting. */
  get size(): number {
    return this.queue.length;
  }

  /** True if an item with this key is already queued (the `maybeEnsure` gate). */
  has(item: T): boolean {
    return this.pending.has(this.keyOf(item));
  }

  /** Enqueue unless an equal-keyed item is already pending (idempotent). */
  enqueue(item: T): void {
    const k = this.keyOf(item);
    if (this.pending.has(k)) return;
    this.pending.add(k);
    this.queue.push(item);
  }

  /** Drain up to `budget` items this frame (FIFO); returns those processed. */
  drain(budget: number): T[] {
    const out: T[] = [];
    const n = Math.max(0, Math.min(budget, this.queue.length));
    for (let i = 0; i < n; i++) {
      const item = this.queue.shift()!;
      this.pending.delete(this.keyOf(item));
      out.push(item);
    }
    return out;
  }

  /** Drop everything (e.g. on a full rebuild that supersedes pending work). */
  clear(): void {
    this.queue.length = 0;
    this.pending.clear();
  }
}
