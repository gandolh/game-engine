/**
 * CitadelServerClient (Citadel 35) — a WebSocket transport that is a DROP-IN for
 * {@link CitadelSimClient} (same public surface). Instead of posting to a local
 * sim Worker, it talks to the multi-writer `@citadel/server`: sends WorkerInbound
 * as JSON, receives WorkerOutbound. `bootstrapSim` stays transport-agnostic — the
 * transport lives entirely here (mirrors the Farm `@farm/client` ↔ `@farm/server`
 * split). Used for online multiplayer; solo keeps the in-browser Worker.
 *
 * Wire-up: main.ts picks this when `?mp` is present; the dev Vite config proxies
 * `/sim` → ws://localhost:8788 (the citadel server).
 */
import type { RenderSnapshot, WorkerInbound, WorkerOutbound, CitadelCommand, CitadelSave } from "@citadel/sim-core/snapshot";

function defaultServerUrl(): string {
  if (typeof location === "undefined") return "ws://localhost:8788";
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/sim`;
}

// citadel-38 P3#15: cap pre-connect queued messages so an unreachable server
// can't grow the buffer unbounded; drop the oldest on overflow.
const MAX_QUEUED = 256;

export class CitadelServerClient {
  private readonly ws: WebSocket;
  private currentSnapshot: RenderSnapshot | null = null;
  private readyCallback: (() => void) | null = null;
  private snapshotCallback: ((snap: RenderSnapshot) => void) | null = null;
  private saveCallback: ((save: CitadelSave) => void) | null = null;
  private disconnectCallback: ((reason: string) => void) | null = null;
  private readonly queued: WorkerInbound[] = [];
  private open = false;
  private closed = false;

  constructor(url: string = defaultServerUrl()) {
    this.ws = new WebSocket(url);
    this.ws.onopen = (): void => {
      this.open = true;
      for (const m of this.queued) this.ws.send(JSON.stringify(m));
      this.queued.length = 0;
    };
    // citadel-38 P3#15: surface transport failure instead of a silent blank screen.
    this.ws.onerror = (): void => {
      if (!this.closed) this.disconnectCallback?.("connection error");
    };
    this.ws.onclose = (): void => {
      this.open = false;
      this.closed = true;
      this.disconnectCallback?.("disconnected");
    };
    this.ws.onmessage = (event: MessageEvent): void => {
      let msg: WorkerOutbound;
      try {
        msg = JSON.parse(event.data as string) as WorkerOutbound;
      } catch {
        return;
      }
      switch (msg.type) {
        case "ready":
          this.readyCallback?.();
          break;
        case "snapshot":
          this.currentSnapshot = msg.snapshot;
          this.snapshotCallback?.(msg.snapshot);
          break;
        case "save-data":
          this.saveCallback?.(msg.save);
          this.saveCallback = null;
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

  sendCommand(command: CitadelCommand): void {
    this.send({ type: "command", command });
  }

  requestSave(cb: (save: CitadelSave) => void): void {
    this.saveCallback = cb;
    this.send({ type: "request-save" });
  }

  loadSave(save: CitadelSave): void {
    this.send({ type: "load-save", save });
  }

  onReady(cb: () => void): void {
    this.readyCallback = cb;
  }

  onSnapshot(cb: (snap: RenderSnapshot) => void): void {
    this.snapshotCallback = cb;
  }

  /** citadel-38 P3#15: notified on transport error/close so the UI can show it. */
  onDisconnect(cb: (reason: string) => void): void {
    this.disconnectCallback = cb;
  }

  get snapshot(): RenderSnapshot | null {
    return this.currentSnapshot;
  }

  private send(msg: WorkerInbound): void {
    if (this.closed) return;
    if (this.open && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      if (this.queued.length >= MAX_QUEUED) this.queued.shift();
      this.queued.push(msg);
    }
  }
}
