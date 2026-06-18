/**
 * CitadelSimClient — main thread wrapper around the sim Worker.
 * Posts WorkerInbound messages, receives WorkerOutbound messages.
 *
 * Phase 1: adds sendCommand() for place/demolish building commands.
 */
import type { RenderSnapshot, WorkerInbound, WorkerOutbound, CitadelCommand } from "@citadel/sim-core/snapshot";

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

  /**
   * Send a citadel command to the worker. The worker enqueues it; the
   * CommandSystem applies it on the next tick. All placement flows through
   * this path — no direct world mutation from the main thread.
   */
  sendCommand(command: CitadelCommand): void {
    this.send({ type: "command", command });
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
