/**
 * Generic deterministic command queue.
 *
 * Commands are plain value objects: { type: string; payload: unknown }.
 * The game registers concrete command unions; the engine stays generic.
 *
 * Insertion order is preserved exactly — the ordered log is the canonical
 * save/replay/MP artifact. Application must be deterministic.
 */

export interface Command<T extends string = string, P = unknown> {
  readonly type: T;
  readonly payload: P;
}

/**
 * FIFO queue. Thread-safe by construction (single JS thread).
 * - `enqueue(cmd)` — called by the Worker on receiving a "command" message,
 *   or directly by headless / test code.
 * - `drain()` — called once per tick by CommandSystem; returns all queued
 *   commands in insertion order and clears the queue.
 */
export class CommandQueue<C extends Command = Command> {
  // Double-buffered like MessageBus.flush(): drain() swaps pending↔drained and
  // returns the live `drained` view (zero allocation), so the caller must consume
  // it before the next drain(). CommandSystem applies it within the same tick.
  private pending: C[] = [];
  private drained: C[] = [];

  enqueue(cmd: C): void {
    this.pending.push(cmd);
  }

  drain(): readonly C[] {
    const tmp = this.drained;
    this.drained = this.pending;
    this.pending = tmp;
    this.pending.length = 0;
    return this.drained;
  }

  get length(): number {
    return this.pending.length;
  }
}
