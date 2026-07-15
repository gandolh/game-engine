
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
}

export type MakeHostFn = (send: SendFn, init: SimInitMsg) => SimHost;

export class RunRegistry {
  private readonly makeHost: MakeHostFn;
  private readonly reapGraceMs: number;
  private readonly runs = new Map<string, Run>();

  constructor(makeHost: MakeHostFn, opts: RunRegistryOptions = {}) {
    this.makeHost = makeHost;
    this.reapGraceMs = opts.reapGraceMs ?? 10_000;
  }

  runKeyFor(init: SimInitMsg): string {
    const base = `${init.seed}:${init.ticksPerDay}:${init.maxDays}`;
    // A clientId isolates the connection into its own private run, so every
    // visitor is always the owner of their own Pip. Absent → shared run.
    return init.clientId !== undefined ? `${base}:${init.clientId}` : base;
  }

  attachInit(socket: ClientSocket, init: SimInitMsg): void {
    this.detach(socket);

    const key = this.runKeyFor(init);
    const existing = this.runs.get(key);

    if (existing === undefined) {

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
    }
  }

  handleControl(socket: ClientSocket, msg: SimInbound): void {
    if (msg.type === "init") {
      this.attachInit(socket, msg);
      return;
    }

    for (const run of this.runs.values()) {
      if (run.sockets.has(socket)) {

        if (socket === run.owner) {
          run.host.handleInbound(msg);
        }

        return;
      }
    }

  }

  detach(socket: ClientSocket): void {
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
