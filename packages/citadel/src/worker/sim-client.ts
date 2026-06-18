/**
 * CitadelSimClient — main thread wrapper around the sim Worker.
 * Posts WorkerInbound messages, receives WorkerOutbound messages.
 *
 * Phase 0: interpolation is trivial (tick advances monotonically,
 * no entity positions to lerp). Alpha is unused.
 */
import type { RenderSnapshot, WorkerInbound, WorkerOutbound } from "@citadel/sim-core/snapshot";

export class CitadelSimClient {
  private readonly worker: Worker;
  private currentSnapshot: RenderSnapshot | null = null;
  private readyCallback: (() => void) | null = null;
  private snapshotCallback: ((snap: RenderSnapshot) => void) | null = null;

  constructor() {
    this.worker = new Worker(new URL("./sim-worker.ts", import.meta.url), {
      type: "module",
    });

    this.worker.onmessage = (event: MessageEvent<WorkerOutbound>) => {
      const msg = event.data;
      switch (msg.type) {
        case "ready":
          this.readyCallback?.();
          break;
        case "snapshot":
          this.currentSnapshot = msg.snapshot;
          this.snapshotCallback?.(msg.snapshot);
          break;
      }
    };
  }

  init(seed: number, ticksPerDay: number): void {
    this.send({ type: "init", seed, ticksPerDay });
  }

  pause(): void {
    this.send({ type: "pause" });
  }

  resume(): void {
    this.send({ type: "resume" });
  }

  setSpeed(multiplier: number): void {
    this.send({ type: "speed", multiplier });
  }

  onReady(cb: () => void): void {
    this.readyCallback = cb;
  }

  onSnapshot(cb: (snap: RenderSnapshot) => void): void {
    this.snapshotCallback = cb;
  }

  get snapshot(): RenderSnapshot | null {
    return this.currentSnapshot;
  }

  private send(msg: WorkerInbound): void {
    this.worker.postMessage(msg);
  }
}
