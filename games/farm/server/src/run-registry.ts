
import type {
  SimInbound,
  SimOutbound,
  SimInitMsg,
  SimStaticLayerMsg,
  SimSnapshotMsg,
} from "@farm/sim-core/protocol";
import type { SnapshotWealthSeries } from "@farm/sim-core/snapshot";
import type { SimHost, SendFn } from "./sim-host";

export interface ClientSocket {
  readonly readyState: number;
  readonly OPEN: number;
  bufferedAmount: number;
  send(data: string): void;
}

interface Run {
  host: SimHost;
  sockets: Set<ClientSocket>;
  owner: ClientSocket | null;
  lastStatic: SimStaticLayerMsg | null;
  lastSnapshot: SimSnapshotMsg | null;
  lastWealthSeries: SnapshotWealthSeries[] | null;
  reapTimer: ReturnType<typeof setTimeout> | null;
}

export interface RunRegistryOptions {

  reapGraceMs?: number;

  /**
   * Ceiling on simultaneously live runs in this process (audit-42). Each run is a full 21-farmer
   * world plus its own tick interval, and `attachInit` minted one for every distinct `clientId`
   * with nothing reading `runCount()` as a limit — so a socket looping `init` with fresh ids grew
   * worlds faster than the 10 s reap could free them. No malice needed either: the normal client
   * path is `clientId: crypto.randomUUID()`, so N browser tabs were already N live sims.
   */
  maxRuns?: number;
}

/** Why an `init` was refused — carried to the socket rather than silently dropped. */
export interface RunRefusal {
  code: "run-limit";
  message: string;
}

export type MakeHostFn = (send: SendFn, init: SimInitMsg) => SimHost;

export class RunRegistry {
  private readonly makeHost: MakeHostFn;
  private readonly reapGraceMs: number;
  private readonly maxRuns: number;
  private readonly runs = new Map<string, Run>();

  constructor(makeHost: MakeHostFn, opts: RunRegistryOptions = {}) {
    this.makeHost = makeHost;
    this.reapGraceMs = opts.reapGraceMs ?? 10_000;
    this.maxRuns = opts.maxRuns ?? 32;
  }

  runKeyFor(init: SimInitMsg): string {
    const base = `${init.seed}:${init.ticksPerDay}:${init.maxDays}`;
    // A clientId isolates the connection into its own private run, so every
    // visitor is always the owner of their own Pip. Absent → shared run.
    return init.clientId !== undefined ? `${base}:${init.clientId}` : base;
  }

  /**
   * Attach `socket` to the run `init` names, creating it if needed.
   *
   * Returns a {@link RunRefusal} when the process is at its run ceiling, so the caller can tell the
   * client rather than leaving it waiting on an `attach` that never comes.
   */
  attachInit(socket: ClientSocket, init: SimInitMsg): RunRefusal | null {
    // ONE RUN PER SOCKET, reaped IMMEDIATELY (audit-42). The 10 s grace exists so a genuinely
    // detached socket can reconnect to its world; a socket that is right here re-`init`ing is not
    // coming back to the old run, so holding it (and its tick interval) for another 10 s just lets
    // an init loop outrun the reaper.
    this.detach(socket, { immediate: true });

    const key = this.runKeyFor(init);
    const existing = this.runs.get(key);

    if (existing === undefined) {
      if (this.runs.size >= this.maxRuns) {
        // Refuse BEFORE allocating anything — no half-built run may be left in the registry.
        return {
          code: "run-limit",
          message: `server is at its limit of ${String(this.maxRuns)} concurrent runs`,
        };
      }

      const run: Run = {
        host: null as unknown as SimHost, 
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

      run.host.handleInbound(init);

      this.sendDirect(socket, { type: "attach", owner: true });
      return null;
    } else {

      if (existing.reapTimer !== null) {
        clearTimeout(existing.reapTimer);
        existing.reapTimer = null;
      }

      existing.sockets.add(socket);

      if (existing.owner === null || !existing.sockets.has(existing.owner)) {
        existing.owner = socket;
      }
      const isOwner = socket === existing.owner;

      this.sendDirect(socket, { type: "attach", owner: isOwner });

      if (existing.lastStatic !== null) {
        this.sendDirectRaw(socket, JSON.stringify(existing.lastStatic));
      }
      if (existing.lastSnapshot !== null) {

        const replaySnap: SimSnapshotMsg =
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
      return null;
    }
  }

  handleControl(socket: ClientSocket, msg: SimInbound): RunRefusal | null {
    if (msg.type === "init") {
      return this.attachInit(socket, msg);
    }

    for (const run of this.runs.values()) {
      if (run.sockets.has(socket)) {

        if (socket === run.owner) {
          run.host.handleInbound(msg);
        }

        return null;
      }
    }
    return null;
  }

  /**
   * Remove `socket` from whichever run holds it. An emptied run is normally kept alive for
   * `reapGraceMs` so a reconnect finds its world; `immediate` tears it down at once, which is what
   * a re-`init` from the SAME live socket wants (see `attachInit`).
   */
  detach(socket: ClientSocket, opts: { immediate?: boolean } = {}): void {
    for (const [key, run] of this.runs.entries()) {
      if (!run.sockets.has(socket)) continue;

      run.sockets.delete(socket);

      if (run.owner === socket) {
        run.owner = null;
        const next = run.sockets.values().next();
        if (!next.done) {
          run.owner = next.value;
          this.sendDirect(run.owner, { type: "attach", owner: true });
        }
      }

      if (run.sockets.size === 0) {
        if (opts.immediate === true) {
          if (run.reapTimer !== null) clearTimeout(run.reapTimer);
          run.host.stop();
          this.runs.delete(key);
          return;
        }

        run.reapTimer = setTimeout(() => {

          if (run.sockets.size === 0) {
            run.host.stop();
            this.runs.delete(key);
          }
        }, this.reapGraceMs);
      }
      return;
    }
  }

  runCount(): number {
    return this.runs.size;
  }

  getRun(key: string): Run | undefined {
    return this.runs.get(key);
  }

  private makeFanOut(run: Run): SendFn {
    const MAX_BUFFERED = 1_000_000;
    return (msg: SimOutbound): void => {

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

        if (msg.type === "snapshot" && socket.bufferedAmount > MAX_BUFFERED) continue;
        socket.send(payload);
      }
    };
  }

  private sendDirect(socket: ClientSocket, msg: SimOutbound): void {
    if (socket.readyState !== socket.OPEN) return;
    socket.send(JSON.stringify(msg));
  }

  private sendDirectRaw(socket: ClientSocket, payload: string): void {
    if (socket.readyState !== socket.OPEN) return;
    socket.send(payload);
  }
}
