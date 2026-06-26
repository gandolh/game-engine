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
import type { WorkerInbound, WorkerOutbound, RenderSnapshot, RosterEntry } from "@citadel/sim-core/snapshot";
import { CitadelBot } from "./bot";

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
  private readonly bots: CitadelBot[] = [];
  // citadel-38 P0#4: the room owner (first human peer) is the only one allowed to
  // pause/resume/change speed. Farm's RunRegistry has the same owner concept.
  private owner: Peer | null = null;

  constructor(private readonly opts: CitadelSimHostOptions = {}) {}

  /**
   * Citadel 37: add a seeded NPC bot — joins as a peer and plays through the
   * same command surface as a human (its commands enter the authoritative log,
   * so a bot-filled match is reproducible from `seed`). Outbound to the bot is
   * dropped (a bot doesn't render).
   */
  addBot(seed: number): void {
    const peer = this.attach(() => {}, true);
    this.bots.push(new CitadelBot(this, peer, seed));
  }

  /** Number of connected peers (test/diagnostic helper). */
  get peerCount(): number {
    return this.peers.size;
  }

  /** Attach a peer; assigns it a stable player id (first peer = player 0). */
  attach(send: SendFn, isBot = false): Peer {
    const playerId = this.nextPlayerId++;
    const peer: Peer = { send, playerId };
    this.peers.add(peer);
    // citadel-38 P0#4: first non-bot peer becomes the room owner (control authority).
    if (this.owner === null && !isBot) this.owner = peer;
    if (this.sim !== null) {
      // Late join into a running room: ensure a PlayerState exists, then snapshot.
      this.ensurePlayer(playerId);
      this.sendSnapshotTo(peer);
      this.broadcastRoster();
    }
    send({ type: "ready" });
    return peer;
  }

  detach(peer: Peer): void {
    this.peers.delete(peer);
    // citadel-38 P0#4: if the owner leaves, promote the next remaining peer so the
    // room doesn't get stuck with no control authority.
    if (peer === this.owner) {
      const next = this.peers.values().next();
      this.owner = next.done ? null : next.value;
    }
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
        // citadel-38 P0#3: `setActivePlayer` is a server-internal routing marker;
        // a client must not be able to forge one to impersonate another player.
        // Reject it at the edge (the server injects its own below).
        if (msg.command.type === "setActivePlayer") return;
        // Multi-writer: route this peer's command to ITS player, then enqueue.
        // Both go into the one authoritative command stream (logged + replayable).
        this.sim.commands.enqueue({ type: "setActivePlayer", payload: { id: peer.playerId } });
        this.sim.commands.enqueue(msg.command);
        return;
      }
      // citadel-38 P0#4: control messages mutate the single shared room clock —
      // only the owner may issue them, else any peer could freeze/fast-forward all.
      case "pause":
        if (peer !== this.owner) return;
        this.paused = true;
        return;
      case "resume":
        if (peer !== this.owner) return;
        this.paused = false;
        return;
      case "speed":
        if (peer !== this.owner) return;
        this.speed = Number.isFinite(msg.multiplier) && msg.multiplier >= 1 ? Math.floor(msg.multiplier) : 1;
        return;
      case "request-save":
        if (this.sim !== null) peer.send({ type: "save-data", save: this.sim.serializeSave(this.tick) });
        return;
      case "load-save":
        // Not supported on a shared multi-writer room (would desync live peers).
        return;
      // Citadel 36: ephemeral social layer — RELAYED, never enqueued into the
      // command stream, so the authoritative log + saves/replay stay deterministic.
      case "presence": {
        const relay: WorkerOutbound = {
          type: "presence",
          playerId: peer.playerId,
          cursorX: msg.cursorX,
          cursorY: msg.cursorY,
          tool: msg.tool,
        };
        for (const other of this.peers) if (other !== peer) other.send(relay);
        return;
      }
      case "emote": {
        const relay: WorkerOutbound = { type: "emote", playerId: peer.playerId, emote: msg.emote };
        for (const other of this.peers) other.send(relay);
        return;
      }
    }
  }

  /** Citadel 36: broadcast the live roster (who's present + alive). Ephemeral. */
  private broadcastRoster(): void {
    if (this.sim === null) return;
    const present = new Set([...this.peers].map((p) => p.playerId));
    const players: RosterEntry[] = this.sim.state.players
      .filter((p) => present.has(p.id))
      .map((p) => ({ playerId: p.id, alive: !p.gameOver }));
    const msg: WorkerOutbound = { type: "roster", players };
    for (const peer of this.peers) peer.send(msg);
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
    // Citadel 37: bots decide + submit commands BEFORE the tick drains the queue.
    for (const bot of this.bots) bot.update();
    this.sim.scheduler.tick({ tick: this.tick });
    this.tick += 1;
    this.broadcastSnapshot();
    this.broadcastRoster();
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
