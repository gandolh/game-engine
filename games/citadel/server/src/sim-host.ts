/**
 * CitadelSimHost (Citadel 35) — server-authoritative, MULTI-WRITER sim host.
 *
 * Adapts the @farm/server SimHost PATTERN (one authoritative sim per room,
 * encode-once-ish snapshot fan-out, late-join) but differs in the key way the
 * brief calls for: it is MULTI-WRITER. @farm/server is owner-writes /
 * spectators-watch; here EVERY peer may submit commands. The host stamps each
 * incoming command into the ONE authoritative command stream (routed to the
 * sending peer's player via a `setActivePlayer` marker — see sim-core), advances
 * the single sim, and fans out a snapshot to every peer (each peer sees its OWN
 * player's view via localId). The command log = the sync + save substrate:
 * same ordered log → same state for every peer and on replay.
 *
 * Transport-agnostic: peers are `SendFn` callbacks. The WebSocket wiring lives in
 * index.ts; tests drive `step()` directly. `bootstrapSim` stays Worker/transport
 * agnostic — the transport is entirely at this edge.
 */
import { bootstrapSim, makePlayerState } from "@citadel/sim-core";
import type { CitadelSimResult } from "@citadel/sim-core/sim-bootstrap";
import type { WorkerInbound, WorkerOutbound, RenderSnapshot } from "@citadel/sim-core/snapshot";

export type SendFn = (msg: WorkerOutbound) => void;

export interface Peer {
  readonly send: SendFn;
  readonly playerId: number;
}

export interface CitadelSimHostOptions {
  worldWidth?: number;
  worldHeight?: number;
  /** MP enables territory build-gating by default. */
  enforceTerritory?: boolean;
  maxDays?: number;
  /** Run a wall-clock tick interval (production). Tests drive step() instead. */
  realtime?: boolean;
  tickRateHz?: number;
}

export class CitadelSimHost {
  private sim: CitadelSimResult | null = null;
  private readonly peers = new Set<Peer>();
  private tick = 0;
  private paused = false;
  private speed = 1;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private nextPlayerId = 0;

  constructor(private readonly opts: CitadelSimHostOptions = {}) {}

  /** Number of connected peers (test/diagnostic helper). */
  get peerCount(): number {
    return this.peers.size;
  }

  /** Attach a peer; assigns it a stable player id (first peer = player 0). */
  attach(send: SendFn): Peer {
    const playerId = this.nextPlayerId++;
    const peer: Peer = { send, playerId };
    this.peers.add(peer);
    if (this.sim !== null) {
      // Late join into a running room: ensure a PlayerState exists, then snapshot.
      this.ensurePlayer(playerId);
      this.sendSnapshotTo(peer);
    }
    send({ type: "ready" });
    return peer;
  }

  detach(peer: Peer): void {
    this.peers.delete(peer);
    if (this.peers.size === 0) this.stop();
  }

  handleInbound(peer: Peer, msg: WorkerInbound): void {
    switch (msg.type) {
      case "init":
        if (this.sim === null) this.start(msg.seed, msg.ticksPerDay);
        else this.sendSnapshotTo(peer); // late joiner asking for state
        return;
      case "command": {
        if (this.sim === null) return;
        // Multi-writer: route this peer's command to ITS player, then enqueue.
        // Both go into the one authoritative command stream (logged + replayable).
        this.sim.commands.enqueue({ type: "setActivePlayer", payload: { id: peer.playerId } });
        this.sim.commands.enqueue(msg.command);
        return;
      }
      case "pause":
        this.paused = true;
        return;
      case "resume":
        this.paused = false;
        return;
      case "speed":
        this.speed = Number.isFinite(msg.multiplier) && msg.multiplier >= 1 ? Math.floor(msg.multiplier) : 1;
        return;
      case "request-save":
        if (this.sim !== null) peer.send({ type: "save-data", save: this.sim.serializeSave(this.tick) });
        return;
      case "load-save":
        // Not supported on a shared multi-writer room (would desync live peers).
        return;
    }
  }

  /** The authoritative sim (test/diagnostic accessor). */
  get simResult(): CitadelSimResult | null {
    return this.sim;
  }

  private ensurePlayer(id: number): void {
    if (this.sim === null) return;
    if (this.sim.state.players.find((p) => p.id === id) === undefined) {
      this.sim.state.players.push(makePlayerState(id));
    }
  }

  private start(seed: number, ticksPerDay: number): void {
    this.sim = bootstrapSim({
      seed,
      ticksPerDay,
      maxDays: this.opts.maxDays ?? 100,
      enforceTerritory: this.opts.enforceTerritory ?? true,
      // Only pass dimensions when set (exactOptionalPropertyTypes rejects explicit undefined).
      ...(this.opts.worldWidth !== undefined ? { worldWidth: this.opts.worldWidth } : {}),
      ...(this.opts.worldHeight !== undefined ? { worldHeight: this.opts.worldHeight } : {}),
    });
    // A PlayerState for every already-attached peer (player 0 exists from bootstrap).
    for (const p of this.peers) this.ensurePlayer(p.playerId);

    this.broadcastSnapshot();

    if (this.opts.realtime) {
      const msPerTick = 1000 / (this.opts.tickRateHz ?? 20);
      this.intervalId = setInterval(() => {
        if (this.paused) return;
        for (let i = 0; i < this.speed; i++) this.step();
      }, msPerTick);
    }
  }

  /** Advance the sim one tick + fan out snapshots. Drained: queued commands. */
  step(): void {
    if (this.sim === null) return;
    this.sim.scheduler.tick({ tick: this.tick });
    this.tick += 1;
    this.broadcastSnapshot();
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private snapshotFor(peer: Peer): RenderSnapshot {
    // Each peer sees its OWN player's view (top-level snapshot fields).
    this.sim!.state.localId = peer.playerId;
    return this.sim!.getSnapshot(this.tick);
  }

  private sendSnapshotTo(peer: Peer): void {
    if (this.sim === null) return;
    peer.send({ type: "snapshot", snapshot: this.snapshotFor(peer) });
  }

  private broadcastSnapshot(): void {
    for (const peer of this.peers) this.sendSnapshotTo(peer);
  }
}
