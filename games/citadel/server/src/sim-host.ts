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

/**
 * Ceiling on the `speed` multiplier (audit-43).
 *
 * `speed` is a SYNCHRONOUS loop count inside `setInterval` (`for (let i = 0; i < this.speed; i++)
 * this.step()`), so an unbounded value is an unbounded amount of work in one callback — the same
 * event-loop-blocking shape as Farm's skip drain (audit-41). Farm clamps here; Citadel is the copy
 * that dropped the clamp, and the host-only check is no defence because `attach` makes the FIRST
 * peer to connect the host.
 *
 * Same value as Farm's `MAX_SPEED_MULTIPLIER`, deliberately: two sim hosts diverging on a safety
 * bound is how this one got lost.
 */
const MAX_SPEED_MULTIPLIER = 8;

/**
 * Cap on a single `placeRoad`/`placeWall` drag (audit-43).
 *
 * `placeDragged` loops a caller-supplied `cmd.payload.tiles` with no length check, so one frame
 * controlled how much work the tick did. A legitimate drag is bounded by the world (192x192 solo,
 * 256x256 here) and by what a hand can drag; anything beyond this is not a gesture.
 */
const MAX_DRAG_TILES = 4096;

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
  /** Run a wall-clock tick interval (production). Tests drive step() instead. */
  realtime?: boolean;
  tickRateHz?: number;
  /**
   * Citadel 38 P1#7: how long the room stays alive after the last peer leaves
   * before it's torn down (lets a refresh/blip reconnect into the same game).
   * Default 10s (mirrors the Farm RunRegistry reap grace).
   */
  reapGraceMs?: number;
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
  // Citadel 38 P0#4: the host is the first peer to attach; only it may pause /
  // resume / change speed of the shared room (peers can't freeze/fast-forward
  // each other). Migrates to the next-remaining peer if the host disconnects.
  private hostPeer: Peer | null = null;
  // Citadel 38 P1#7: when the room empties we arm a grace timer rather than
  // tearing down immediately, so a reconnect within the window rejoins the same
  // live sim. If it fires while still empty, reset() nulls `sim` so the NEXT
  // `init` starts a clean room (the old bug: detach stopped the interval but left
  // `sim` set → a reconnect got a snapshot of a frozen, non-ticking sim).
  private readonly reapGraceMs: number;
  private reapTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly opts: CitadelSimHostOptions = {}) {
    this.reapGraceMs = opts.reapGraceMs ?? 10_000;
  }

  /**
   * Citadel 37: add a seeded NPC bot — joins as a peer and plays through the
   * same command surface as a human (its commands enter the authoritative log,
   * so a bot-filled match is reproducible from `seed`). Outbound to the bot is
   * dropped (a bot doesn't render).
   */
  addBot(seed: number): void {
    // Bots attach only after the human host is present (the first human peer is
    // the room host), so a bot never becomes host. Outbound is dropped.
    const peer = this.attach(() => {});
    this.bots.push(new CitadelBot(this, peer, seed));
  }

  /** Number of connected peers (test/diagnostic helper). */
  get peerCount(): number {
    return this.peers.size;
  }

  /** Whether the shared room is paused (test/diagnostic helper). */
  get isPaused(): boolean {
    return this.paused;
  }

  /** The current speed multiplier (test/diagnostic helper). */
  get speedMultiplier(): number {
    return this.speed;
  }

  /** The host peer's player id, or null if the room is empty (test/diagnostic). */
  get hostPlayerId(): number | null {
    return this.hostPeer?.playerId ?? null;
  }

  /** Attach a peer; assigns it a stable player id (first peer = player 0). */
  attach(send: SendFn): Peer {
    // A peer arrived — cancel any pending teardown so we keep the live room.
    if (this.reapTimer !== null) {
      clearTimeout(this.reapTimer);
      this.reapTimer = null;
    }
    const playerId = this.nextPlayerId++;
    const peer: Peer = { send, playerId };
    this.peers.add(peer);
    if (this.hostPeer === null) this.hostPeer = peer; // first peer = room host

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
    this.prunePlayerState(peer.playerId);
    // Citadel 38 P0#4: if the host leaves, promote the next-remaining peer so
    // room control isn't frozen (Set preserves attach order → oldest survivor).
    if (peer === this.hostPeer) {
      this.hostPeer = [...this.peers][0] ?? null;
      // Citadel 97/13: re-stamp isHost so the new host's controls enable immediately — even
      // while paused (no tick → no snapshot otherwise). No-op when the room is now empty.
      this.broadcastSnapshot();
    }
    // Citadel 38 P1#7: don't tear down immediately — arm the reap grace. The sim
    // keeps ticking during the window so a quick reconnect rejoins it.
    if (this.peers.size === 0) this.armReap();
  }

  /** Schedule a teardown if the room is still empty after the grace window. */
  private armReap(): void {
    if (this.reapTimer !== null) return; // already armed
    this.reapTimer = setTimeout(() => {
      this.reapTimer = null;
      if (this.peers.size === 0) this.reset();
    }, this.reapGraceMs);
  }

  /**
   * Fully tear the room down so the NEXT `init` starts a clean, ticking sim.
   * Stops the interval AND nulls `sim` (the missing step that left reconnects
   * frozen), and clears all per-room state.
   */
  private reset(): void {
    this.stop();
    this.sim = null;
    this.tick = 0;
    this.hostPeer = null;
    this.paused = false;
    this.speed = 1;
    this.nextPlayerId = 0;
    this.bots.length = 0;
  }

  handleInbound(peer: Peer, msg: WorkerInbound): void {
    // audit-43: shape guard at the host's own entry point, mirroring Farm's. `switch (msg.type)`
    // dereferences a `null` frame, and a throw out of the interval callback on a publicly
    // reachable socket is an `uncaughtException`. Field-level validation is NOT here: that is
    // Farm's `validate-inbound.ts` (audit-42), and porting it is a revival precondition recorded
    // in wiki/citadel-mp-deprecated.md.
    if (typeof msg !== "object" || msg === null || typeof (msg as { type?: unknown }).type !== "string") {
      return;
    }
    switch (msg.type) {
      case "init":
        if (this.sim === null) this.start(msg.seed, msg.ticksPerDay);
        else this.sendSnapshotTo(peer); // late joiner asking for state
        return;
      case "command": {
        if (this.sim === null) return;
        // audit-43: `msg.command.type` was dereferenced unguarded, so `{type:"command"}` with no
        // `command` threw out of the interval callback and (before the process handlers below)
        // took the whole server down.
        const command = (msg as { command?: { type?: unknown } }).command;
        if (typeof command !== "object" || command === null || typeof command.type !== "string") {
          return;
        }
        // Citadel 38 P0#3: setActivePlayer is a server-internal routing marker —
        // a peer must never inject one (it would mis-route the FOLLOWING command
        // to another player). Drop it; the host stamps the trusted marker below.
        if (msg.command.type === "setActivePlayer") return;
        // audit-43: bound a drag before it reaches `placeDragged`, which loops the payload with
        // no length check of its own.
        if (command.type === "placeRoad" || command.type === "placeWall") {
          const tiles = (msg.command as { payload?: { tiles?: unknown } }).payload?.tiles;
          if (!Array.isArray(tiles) || tiles.length > MAX_DRAG_TILES) return;
        }
        // Multi-writer: route this peer's command to ITS player, then enqueue.
        // Both go into the one authoritative command stream (logged + replayable).
        this.sim.commands.enqueue({ type: "setActivePlayer", payload: { id: peer.playerId } });
        this.sim.commands.enqueue(msg.command);
        return;
      }
      // Citadel 38 P0#4: room-control is host-only — a non-host peer can't freeze
      // or fast-forward the shared sim for everyone.
      // Citadel 97/13: after a host control change, immediately re-broadcast so every peer
      // rederives the new authoritative paused/speed. Crucial while paused — the tick loop
      // emits no snapshot then, so without this a pause would never reach the other peers.
      case "pause":
        if (peer !== this.hostPeer) return;
        this.paused = true;
        this.broadcastSnapshot();
        return;
      case "resume":
        if (peer !== this.hostPeer) return;
        this.paused = false;
        this.broadcastSnapshot();
        return;
      case "speed":
        if (peer !== this.hostPeer) return;
        this.speed =
          Number.isFinite(msg.multiplier) && msg.multiplier >= 1
            ? Math.min(MAX_SPEED_MULTIPLIER, Math.floor(msg.multiplier))
            : 1;
        this.broadcastSnapshot();
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

  /**
   * Drop a departed peer's `PlayerState` when it is safe to (audit-43).
   *
   * `nextPlayerId` only ever increments and `ensurePlayer` only ever pushes, so before this every
   * connect left a `PlayerState` in `sim.state.players` FOREVER — `reset()` only fires when the
   * room fully empties, and ~89 sim-core call sites iterate that array. A reconnect loop grew it
   * without bound, and each entry costs every per-player system a pass.
   *
   * SAFE-ONLY, and that is the whole design: a state is removed only when its player owns nothing
   * in the world. A player that built a settlement keeps its state, because its buildings and
   * villagers carry that `ownerId` and orphaning them is worse than the leak. The unbounded case —
   * a peer that connects and leaves without building — is exactly the prunable one.
   *
   * Ids are never reused (`nextPlayerId` keeps incrementing), so nothing can inherit a stale
   * identity. Nothing depends on `players` indices being stable — checked: every access is by
   * `.find(p => p.id === …)` or a full iteration, never positional.
   */
  private prunePlayerState(playerId: number): void {
    if (this.sim === null) return;
    if (playerId === 0) return; // bootstrap's own player; not ours to remove
    for (const b of this.sim.getBuildings()) {
      if (b.ownerId === playerId) return;
    }
    for (const v of this.sim.villagerWorld.query("villager")) {
      if (v.villager?.ownerId === playerId) return;
    }
    const i = this.sim.state.players.findIndex((p) => p.id === playerId);
    if (i >= 0) this.sim.state.players.splice(i, 1);
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
      enforceTerritory: this.opts.enforceTerritory ?? true,
      // Every room this host starts is a match: the town-hall is the keep/raid anchor from
      // the founding peer's very first placement, not once a second peer shows up.
      multiplayer: true,
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
    // audit-43: guard the tick. Farm's host has had this since audit-17; Citadel's `step()` called
    // `scheduler.tick` bare, so ONE throw from any system inside the interval callback took the
    // whole process down. Halting the room (rather than advancing onto a world state no clean tick
    // could produce) mirrors Farm's tick-fault policy — see decisions.md.
    try {
      // Citadel 37: bots decide + submit commands BEFORE the tick drains the queue.
      for (const bot of this.bots) bot.update();
      this.sim.scheduler.tick({ tick: this.tick });
    } catch (err) {
      console.error(`[citadel-server] tick ${String(this.tick)} faulted; halting the room`, err);
      this.stop();
      return;
    }
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
    const snap = this.sim!.getSnapshot(this.tick);
    // Citadel 97/13: room pacing (paused/speed) is host-authoritative — stamp it onto every
    // peer's snapshot so clients rederive it instead of trusting optimistic local state.
    // `isHost` is per-peer (only the host peer gets true), so a non-host greys its controls.
    return { ...snap, isHost: peer === this.hostPeer, speed: this.speed, paused: this.paused };
  }

  private sendSnapshotTo(peer: Peer): void {
    if (this.sim === null) return;
    peer.send({ type: "snapshot", snapshot: this.snapshotFor(peer) });
  }

  private broadcastSnapshot(): void {
    for (const peer of this.peers) this.sendSnapshotTo(peer);
  }
}
