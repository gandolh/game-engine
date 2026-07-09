/**
 * CitadelSimClient — main thread wrapper around the sim Worker.
 * Posts WorkerInbound messages, receives WorkerOutbound messages.
 *
 * Phase 1: adds sendCommand() for place/demolish building commands.
 * Phase 5: adds requestSave() and loadSave() for save/load via command-log replay.
 */
import type { RenderSnapshot, WorkerInbound, WorkerOutbound, CitadelCommand, CitadelSave } from "@citadel/sim-core/snapshot";

export class CitadelSimClient {
  private readonly worker: Worker;
  private currentSnapshot: RenderSnapshot | null = null;
  private snapshotCallback: ((snap: RenderSnapshot) => void) | null = null;
  private saveCallback: ((save: CitadelSave) => void) | null = null;

  constructor() {
    this.worker = new Worker(new URL("./sim-worker.ts", import.meta.url), {
      type: "module",
    });

    this.worker.onmessage = (event: MessageEvent<WorkerOutbound>) => {
      const msg = event.data;
      switch (msg.type) {
        case "snapshot":
          this.currentSnapshot = msg.snapshot;
          this.snapshotCallback?.(msg.snapshot);
          break;
        case "save-data":
          this.saveCallback?.(msg.save);
          this.saveCallback = null; // one-shot callback
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

  /**
   * Phase 5 Save: request the worker to serialize its command log.
   * The callback fires once with the CitadelSave object.
   */
  requestSave(cb: (save: CitadelSave) => void): void {
    this.saveCallback = cb;
    this.send({ type: "request-save" });
  }

  /**
   * Phase 5 Load: send a CitadelSave to the worker, which replays it
   * into a fresh bootstrapSim() and resumes from the saved tick.
   * The worker emits "ready" when replay is complete.
   */
  loadSave(save: CitadelSave): void {
    this.send({ type: "load-save", save });
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
