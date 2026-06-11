/**
 * run-registry.ts — server-side run registry for shared-world broadcasting.
 *
 * One SimHost per unique (seed × ticksPerDay × maxDays) run key.
 * Multiple sockets attach to the same run; they all receive the same encoded
 * payload (stringify-once fan-out). The first socket to attach is the run owner
 * and is the only one whose control messages (pause/speed/step/skip/input/stop)
 * are forwarded to the host. Spectators receive state but cannot control the run.
 *
 * Zero-socket reaping: when the last socket detaches a grace timer starts; if no
 * socket reattaches before it fires the host is stopped and the run deleted.
 *
 * Socket-library-agnostic: callers pass objects satisfying ClientSocket so tests
 * can inject fakes without an actual WebSocket server.
 */
import type {
  WorkerInbound,
  WorkerOutbound,
  WorkerInitMsg,
  WorkerStaticLayerMsg,
  WorkerSnapshotMsg,
} from "@farm/sim-core/protocol";
import type { SnapshotWealthSeries } from "@farm/sim-core/snapshot";
import type { SimHost, SendFn } from "./sim-host";

// ---------------------------------------------------------------------------
// Public socket interface (satisfied by ws.WebSocket and fake implementations)
// ---------------------------------------------------------------------------

export interface ClientSocket {
  readonly readyState: number;
  readonly OPEN: number;
  bufferedAmount: number;
  send(data: string): void;
}

// ---------------------------------------------------------------------------
// Internal run record
// ---------------------------------------------------------------------------

interface Run {
  host: SimHost;
  sockets: Set<ClientSocket>;
  owner: ClientSocket | null;
  lastStatic: WorkerStaticLayerMsg | null;
  lastSnapshot: WorkerSnapshotMsg | null;
  lastWealthSeries: SnapshotWealthSeries[] | null;
  reapTimer: ReturnType<typeof setTimeout> | null;
}

// ---------------------------------------------------------------------------
// RunRegistry
// ---------------------------------------------------------------------------

export interface RunRegistryOptions {
  /** How long (ms) to wait after the last socket leaves before stopping the host. */
  reapGraceMs?: number;
}

export type MakeHostFn = (send: SendFn, init: WorkerInitMsg) => SimHost;

export class RunRegistry {
  private readonly makeHost: MakeHostFn;
  private readonly reapGraceMs: number;
  private readonly runs = new Map<string, Run>();

  constructor(makeHost: MakeHostFn, opts: RunRegistryOptions = {}) {
    this.makeHost = makeHost;
    this.reapGraceMs = opts.reapGraceMs ?? 10_000;
  }

  // --------------------------------------------------------------------------
  // Run key
  // --------------------------------------------------------------------------

  /**
   * Derive a run key from init params.
   * tickRateHz is wall-clock pacing only; excluding it means two connections
   * asking for the same world at different tick rates share one sim (the first
   * caller's rate wins). This is intentional: the world is deterministic and the
   * rate is just display throttling.
   */
  runKeyFor(init: WorkerInitMsg): string {
    return `${init.seed}:${init.ticksPerDay}:${init.maxDays}`;
  }

  // --------------------------------------------------------------------------
  // Attach
  // --------------------------------------------------------------------------

  attachInit(socket: ClientSocket, init: WorkerInitMsg): void {
    const key = this.runKeyFor(init);
    const existing = this.runs.get(key);

    if (existing === undefined) {
      // New run — create host with a fan-out send that caches messages and
      // stringifies once before sending to all attached sockets.
      const run: Run = {
        host: null as unknown as SimHost, // filled below
        sockets: new Set(),
        owner: socket,
        lastStatic: null,
        lastSnapshot: null,
        lastWealthSeries: null,
        reapTimer: null,
      };

      const fanOut = this.makeFanOut(run);
      run.host = this.makeHost(fanOut, init);
      this.runs.set(key, run);

      run.sockets.add(socket);
      // Start the sim.
      run.host.handleInbound(init);
      // Notify this socket it is the owner.
      this.sendDirect(socket, { type: "attach", owner: true });
    } else {
      // Existing run — cancel any reap timer, add socket, replay cached state.
      if (existing.reapTimer !== null) {
        clearTimeout(existing.reapTimer);
        existing.reapTimer = null;
      }

      existing.sockets.add(socket);

      // Determine ownership: keep existing owner if still connected; otherwise
      // this socket becomes the new owner (first socket in set after addition).
      if (existing.owner === null || !existing.sockets.has(existing.owner)) {
        existing.owner = socket;
      }
      const isOwner = socket === existing.owner;

      // Notify this socket about its role.
      this.sendDirect(socket, { type: "attach", owner: isOwner });

      // Replay cached state to the late joiner only.
      if (existing.lastStatic !== null) {
        this.sendDirectRaw(socket, JSON.stringify(existing.lastStatic));
      }
      if (existing.lastSnapshot !== null) {
        // Patch wealthSeries so the late joiner's graph populates immediately.
        const replaySnap: WorkerSnapshotMsg =
          existing.lastWealthSeries !== null
            ? {
                ...existing.lastSnapshot,
                snapshot: {
                  ...existing.lastSnapshot.snapshot,
                  wealthSeries: existing.lastWealthSeries,
                },
              }
            : existing.lastSnapshot;
        this.sendDirectRaw(socket, JSON.stringify(replaySnap));
      }
    }
  }

  // --------------------------------------------------------------------------
  // Control
  // --------------------------------------------------------------------------

  handleControl(socket: ClientSocket, msg: WorkerInbound): void {
    if (msg.type === "init") {
      this.attachInit(socket, msg);
      return;
    }
    // Find the run this socket belongs to.
    for (const run of this.runs.values()) {
      if (run.sockets.has(socket)) {
        // Only the owner may send control messages.
        if (socket === run.owner) {
          run.host.handleInbound(msg);
        }
        // Spectator control silently ignored.
        return;
      }
    }
    // Socket not yet in any run — ignore.
  }

  // --------------------------------------------------------------------------
  // Detach
  // --------------------------------------------------------------------------

  detach(socket: ClientSocket): void {
    for (const [key, run] of this.runs.entries()) {
      if (!run.sockets.has(socket)) continue;

      run.sockets.delete(socket);

      // If the departing socket was the owner, assign ownership to whoever
      // remains, then notify them.
      if (run.owner === socket) {
        run.owner = null;
        const next = run.sockets.values().next();
        if (!next.done) {
          run.owner = next.value;
          this.sendDirect(run.owner, { type: "attach", owner: true });
        }
      }

      if (run.sockets.size === 0) {
        // Last socket left — start the reap timer.
        run.reapTimer = setTimeout(() => {
          // Double-check: if a socket raced to attach, the timer would have been
          // cancelled in attachInit; this branch means the run is truly empty.
          if (run.sockets.size === 0) {
            run.host.stop();
            this.runs.delete(key);
          }
        }, this.reapGraceMs);
      }
      return;
    }
  }

  // --------------------------------------------------------------------------
  // Introspection (tests / monitoring)
  // --------------------------------------------------------------------------

  runCount(): number {
    return this.runs.size;
  }

  getRun(key: string): Run | undefined {
    return this.runs.get(key);
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  /**
   * Build the fan-out send function for a run.
   * Caches static-layer and snapshot messages; stringifies once; distributes
   * to every open socket (with per-socket drop-stale for snapshots).
   */
  private makeFanOut(run: Run): SendFn {
    const MAX_BUFFERED = 1_000_000;
    return (msg: WorkerOutbound): void => {
      // Cache for late-join replay.
      if (msg.type === "static-layer") {
        run.lastStatic = msg;
      } else if (msg.type === "snapshot") {
        run.lastSnapshot = msg;
        if (msg.snapshot.wealthSeries !== null) {
          run.lastWealthSeries = msg.snapshot.wealthSeries;
        }
      }

      const payload = JSON.stringify(msg);
      for (const socket of run.sockets) {
        if (socket.readyState !== socket.OPEN) continue;
        // Drop stale snapshots for slow clients; never drop static/profile/attach.
        if (msg.type === "snapshot" && socket.bufferedAmount > MAX_BUFFERED) continue;
        socket.send(payload);
      }
    };
  }

  /** Send a WorkerOutbound message directly to one socket (not through the fan-out). */
  private sendDirect(socket: ClientSocket, msg: WorkerOutbound): void {
    if (socket.readyState !== socket.OPEN) return;
    socket.send(JSON.stringify(msg));
  }

  /** Send a pre-serialised payload directly to one socket. */
  private sendDirectRaw(socket: ClientSocket, payload: string): void {
    if (socket.readyState !== socket.OPEN) return;
    socket.send(payload);
  }
}
