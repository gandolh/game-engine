/**
 * client.ts — main-thread facade for the sim, talking to the Node sim server
 * over a WebSocket (brief 58). Previously this spawned an in-browser Web Worker;
 * the sim now lives in a separate Node process (@farm/server) and this client
 * sends/receives the SAME WorkerInbound/WorkerOutbound protocol over a socket.
 * The public API is unchanged so the renderer (main/*) is untouched.
 *
 * SimClient:
 *  - Opens a WebSocket to the server and sends WorkerInitMsg (once connected).
 *  - Receives WorkerStaticLayerMsg (once) and WorkerSnapshotMsg (per tick).
 *  - Keeps the two most-recent snapshots (prev + current) for interpolation.
 *  - Exposes interpolated sprites: farmer sprites are lerped between prev and
 *    current positions; all other sprites use the current position as-is.
 *  - Exposes accessor methods so the render loop can pull observer/leaderboard/
 *    slate/meets/overlay data without touching the wire protocol directly.
 *
 * Interpolation note: `performance.now()` is used for the arrival timestamp.
 * This is *display timing* on the main thread — not sim logic — so it is
 * correct to use wall-clock time here (determinism is a sim-side property).
 * Network jitter is wider than postMessage; the one-tick render-delay margin
 * (see renderDelayMs) absorbs a slightly-late snapshot.
 */

import type {
  WorkerInbound,
  WorkerOutbound,
  WorkerInitMsg,
  WorkerStaticLayerMsg,
  RenderSnapshot,
  SnapshotSprite,
  SnapshotRivalry,
  SnapshotWealthSeries,
  FinalStandingRow,
  RunRecap,
  RelationshipMatrixData,
  ObserverSnapshot,
  LeaderboardRow,
} from "@farm/sim-core/snapshot";
import type { ProfileReport } from "@engine/core";
import type { ShopOffer } from "@farm/sim-core/agents/shop-slate";
import { clamp, lerp, smoothstep, copySprite } from "./interp";

/**
 * Resolve the sim server WebSocket URL, same-origin under the app's base path
 * (e.g. wss://host/farm-valley/sim in prod, reverse-proxied by Caddy). In dev,
 * Vite's server.proxy forwards this path to ws://localhost:8787. Falls back to a
 * localhost default outside a browser (e.g. tests).
 */
function resolveServerUrl(): string {
  if (typeof location === "undefined") return "ws://localhost:8787";
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  const base = import.meta.env.BASE_URL ?? "/";
  return `${scheme}://${location.host}${base}sim`;
}

export class SimClient {
  private readonly ws: WebSocket;
  /** Messages queued before the socket opened; flushed on `open`. */
  private readonly pending: WorkerInbound[] = [];
  private conned = false;
  private connectionLostCallback: (() => void) | null = null;
  /** Brief 66 — visibility listener handle; null in headless/test environments. */
  private docListener: (() => void) | null = null;

  private prevSnapshot: RenderSnapshot | null = null;
  private currentSnapshot: RenderSnapshot | null = null;
  /** Last non-null wealthSeries received (the server omits unchanged ones). */
  private cachedWealthSeries: SnapshotWealthSeries[] = [];

  /** performance.now() when the current snapshot arrived. */
  private lastSnapshotArrivalMs = 0;

  /** ms between ticks (1000 / tickRateHz), set in init(). */
  private msPerTick = 50;

  /**
   * Render delay (the "interpolate in the past" margin). We render two full
   * ticks behind the newest snapshot's arrival so there is always a known next
   * sample to interpolate toward — when a snapshot arrives late, we glide
   * through the gap instead of freezing pinned at alpha=1. Two ticks (vs the
   * old one) absorbs the wider WS jitter of the client/server split; the cost
   * is ~2 ticks of display latency (100 ms at the default rate), imperceptible
   * for a watch-only game. (Open-questions round, 2026-06-10.)
   */
  private get renderDelayMs(): number {
    return 2 * this.msPerTick;
  }

  private staticLayerCallback: ((msg: WorkerStaticLayerMsg) => void) | null = null;
  private snapshotCallback: ((snap: RenderSnapshot) => void) | null = null;
  private profileCallback: ((tick: number, report: ProfileReport) => void) | null = null;
  private attachCallback: ((owner: boolean) => void) | null = null;

  /**
   * Whether this client is the run owner (controls playback).
   * Default true so single-player / headless paths behave as before —
   * the server sends an "attach" message only in the shared-run path.
   */
  private isOwner = true;

  // T1.2 — interpolation pooling. getInterpolatedSprites runs every render
  // frame (~60 Hz), so all of this is reused rather than allocated per call:
  //  - prevById is rebuilt once per arriving snapshot (in onmessage), not per
  //    frame, and indexes the PREV snapshot's interpolated sprites by id.
  //  - interpOut is a pooled output array; we mutate its sprite objects in place
  //    and only grow it when the sprite count rises.
  private readonly prevById = new Map<number, SnapshotSprite>();
  private interpOut: SnapshotSprite[] = [];

  constructor(url: string = resolveServerUrl()) {
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.conned = true;
      // Flush anything queued before the socket was ready (e.g. the init message).
      for (const msg of this.pending) this.ws.send(JSON.stringify(msg));
      this.pending.length = 0;
    };

    this.ws.onmessage = (event: MessageEvent) => {
      let msg: WorkerOutbound;
      try {
        msg = JSON.parse(event.data as string) as WorkerOutbound;
      } catch {
        return; // ignore malformed frames
      }
      if (msg.type === "static-layer") {
        this.staticLayerCallback?.(msg);
      } else if (msg.type === "snapshot") {
        this.prevSnapshot = this.currentSnapshot;
        this.currentSnapshot = msg.snapshot;
        this.lastSnapshotArrivalMs = performance.now();
        // wealthSeries is only sent on snapshots where new per-day rows exist
        // (null in between) — cache the last real one for the graph panel.
        if (msg.snapshot.wealthSeries !== null) {
          this.cachedWealthSeries = msg.snapshot.wealthSeries;
        }
        // T1.2 — rebuild the prev-sprite id index once per snapshot (not per
        // frame). prevSnapshot is the just-superseded current snapshot.
        this.prevById.clear();
        const prev = this.prevSnapshot;
        if (prev !== null) {
          for (const s of prev.sprites) {
            if (s.interpolate && s.id !== null) this.prevById.set(s.id, s);
          }
        }
        // Brief 66 — while the tab is hidden, backlogged snapshots must not
        // form a lerping pair that straddles the hidden gap. Force-clear the
        // pair so sprites snap to current on re-show rather than lerping across
        // however many ticks passed while hidden.
        if (typeof document !== "undefined" && document.hidden) {
          this.prevSnapshot = null;
          this.prevById.clear();
        }
        this.snapshotCallback?.(msg.snapshot);
      } else if (msg.type === "profile") {
        this.profileCallback?.(msg.tick, msg.report);
      } else if (msg.type === "attach") {
        // Brief 72 — shared-run attach reply from the server registry.
        // The server only sends this in the shared-run path; default is owner=true
        // so single-player / headless paths are unaffected.
        this.isOwner = msg.owner;
        this.attachCallback?.(msg.owner);
      }
    };

    this.ws.onclose = () => {
      this.conned = false;
      this.connectionLostCallback?.();
    };
    this.ws.onerror = () => {
      // A failed connection fires error then close; surface lost-connection once.
      this.connectionLostCallback?.();
    };

    // Brief 66 — register the visibility listener for tab-hide/show resync.
    // Guarded so headless tests (no `document`) are unaffected.
    if (typeof document !== "undefined") {
      this.docListener = () => this.onVisibilityChange();
      document.addEventListener("visibilitychange", this.docListener);
    }
  }

  /**
   * Brief 66 — handle tab visibility transitions.
   * Hidden: drop the snapshot pair so nothing lerps across the hidden interval.
   * Visible: reset the arrival timestamp so the next snapshot starts a fresh window.
   */
  private onVisibilityChange(): void {
    if (document.hidden) {
      this.prevSnapshot = null;
      this.prevById.clear();
    } else {
      this.lastSnapshotArrivalMs = performance.now();
    }
  }

  /**
   * Send a protocol message to the server, queueing it if the socket has not
   * opened yet (so init() can be called immediately after construction).
   */
  private sendMsg(msg: WorkerInbound): void {
    if (this.conned && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.pending.push(msg);
    }
  }

  /** Called when the socket closes or errors (server gone). Render-side hook. */
  onConnectionLost(cb: () => void): void {
    this.connectionLostCallback = cb;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Send the init message to start the run. The SERVER owns the pathfinder now
   * (it reads pathfinding.wasm from disk), so unlike the old Worker path we no
   * longer fetch/transfer WASM here — we just send the run params. Queued until
   * the socket opens.
   */
  init(opts: Omit<WorkerInitMsg, "type">): void {
    this.msPerTick = 1000 / opts.tickRateHz;
    this.sendMsg({ type: "init", ...opts });
  }

  /** Stop the server's sim loop for this connection. */
  stop(): void {
    this.sendMsg({ type: "stop" });
  }

  // ---------------------------------------------------------------------------
  // Playback controls (wall-clock pacing only — never change sim state)
  // ---------------------------------------------------------------------------

  /** Pause or resume sim advance. While paused no snapshots arrive. */
  setPaused(paused: boolean): void {
    this.sendMsg({ type: "pause", paused });
  }

  /**
   * Set the tick multiplier (1, 2, 4). The worker runs `multiplier` ticks per
   * interval fire; each still posts one snapshot, so the client's
   * arrival-timestamp interpolation stays correct (snapshots just arrive
   * faster). No change to msPerTick is needed.
   */
  setSpeed(multiplier: number): void {
    this.sendMsg({ type: "speed", multiplier });
  }

  /** While paused, advance exactly one tick then stay paused. */
  step(): void {
    this.sendMsg({ type: "step" });
  }

  /**
   * Fast-forward until the next high-drama event (drama >= HIGHLIGHT_THRESHOLD)
   * or a safety cap. The worker resumes at the prior pace after stopping.
   * Brief 40.
   */
  skipToHighlight(): void {
    this.sendMsg({ type: "skipToHighlight" });
  }

  /**
   * Send player (Pip) input to the worker. `moveX`/`moveY` are the held
   * horizontal/vertical axes (both set = diagonal; null = released); `action`
   * requests the selected-slot field action; `selectSlot` (0-based, or null)
   * switches the active hotbar slot. Optional `actionTile` overrides the
   * faced-tile target for a click-to-act event; the server applies a
   * Chebyshev-≤1 reach guard before queuing an intention.
   * The worker buffers these onto the player entity for PlayerControlSystem to consume.
   */
  sendInput(
    moveX: "left" | "right" | null,
    moveY: "up" | "down" | null,
    action: boolean,
    selectSlot: number | null = null,
    actionTile: { x: number; y: number } | null = null,
  ): void {
    this.sendMsg({ type: "input", moveX, moveY, action, selectSlot, actionTile });
  }

  /**
   * Swap two slots in the player's unified item grid (inventory drag-drop). Indices are
   * 0-based into the grid; the server ignores out-of-range indices. Owner-gated upstream.
   */
  swapSlots(a: number, b: number): void {
    this.sendMsg({ type: "swap-slots", a, b });
  }

  /** Terminate the worker (hard stop). */
  terminate(): void {
    // Brief 66 — detach the visibility listener so the client GC's cleanly.
    if (this.docListener !== null && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.docListener);
      this.docListener = null;
    }
    this.ws.close();
  }

  /**
   * Turn worker-side profiling on/off (P0). While on, the worker periodically
   * posts a profile report (tick + snapshot timings + payload size) consumed via
   * onProfile(). Diagnostic only — does not affect the sim.
   */
  setProfiling(enabled: boolean): void {
    this.sendMsg({ type: "profile", enabled });
  }

  // ---------------------------------------------------------------------------
  // Event hooks
  // ---------------------------------------------------------------------------

  /** Called once when the static-layer message arrives. */
  onStaticLayer(cb: (msg: WorkerStaticLayerMsg) => void): void {
    this.staticLayerCallback = cb;
  }

  /** Called each tick when a snapshot arrives. */
  onSnapshot(cb: (snap: RenderSnapshot) => void): void {
    this.snapshotCallback = cb;
  }

  /** Called when a worker profiling report arrives (only while profiling is on). */
  onProfile(cb: (tick: number, report: ProfileReport) => void): void {
    this.profileCallback = cb;
  }

  /**
   * Called when the server sends an attach reply (brief 72 shared-run path).
   * Fires with `owner: true` if this client controls playback, `false` for spectators.
   * Not called in the single-player / headless path (isOwner stays true).
   */
  onAttach(cb: (owner: boolean) => void): void {
    this.attachCallback = cb;
  }

  /**
   * Whether this client is the run owner (may send control messages).
   * True by default so single-player / headless paths are unaffected.
   * Set to false when the server sends `{ type: "attach", owner: false }`.
   */
  get owner(): boolean {
    return this.isOwner;
  }

  // ---------------------------------------------------------------------------
  // Snapshot access
  // ---------------------------------------------------------------------------

  latestSnapshot(): RenderSnapshot | null {
    return this.currentSnapshot;
  }

  // ---------------------------------------------------------------------------
  // Interpolated sprites
  // ---------------------------------------------------------------------------

  /**
   * Returns the dynamic sprites for the current frame.
   *
   * For sprites with `interpolate: true` (farmers) a lerp between the
   * previous and current snapshot positions is computed using
   *   alpha = clamp((now - lastSnapshotArrivalMs) / msPerTick, 0, 1)
   *
   * Non-interpolated sprites use the current snapshot position as-is.
   *
   * Returns [] if no snapshot has arrived yet.
   *
   * POOLED RETURN (T1.2): the returned array and its sprite objects are
   * reused across calls and overwritten on the next call. Consume the result
   * within the current frame; do not retain it across frames, and finish using
   * one result before calling this (or getFarmerInterpolatedPos) again.
   */
  getInterpolatedSprites(): SnapshotSprite[] {
    const current = this.currentSnapshot;
    if (current === null) {
      this.interpOut.length = 0;
      return this.interpOut;
    }

    const now = performance.now();
    // Play the interpolation head one render-delay in the PAST. With the delay
    // the alpha=1 endpoint is reached ~renderDelayMs after the next snapshot is
    // due — so a slightly-late snapshot is absorbed by the margin instead of
    // showing as a freeze-then-jump. Easing (smoothstep) softens tile entry/exit.
    const rawAlpha = clamp(
      (now - this.lastSnapshotArrivalMs - this.renderDelayMs) / this.msPerTick,
      0,
      1,
    );
    const alpha = smoothstep(rawAlpha);

    const prev = this.prevSnapshot;
    const src = current.sprites;
    const out = this.interpOut;

    // Write each current sprite into the pooled output, copying fields in place
    // (no per-frame object/array allocation). For interpolated sprites with a
    // matching prev, lerp x/y; everything else passes through unchanged.
    for (let i = 0; i < src.length; i += 1) {
      const s = src[i]!;
      let dst = out[i];
      if (dst === undefined) {
        // Grow the pool by one reusable record.
        dst = { ...s };
        out[i] = dst;
      } else {
        copySprite(dst, s);
      }
      if (s.interpolate && s.id !== null && prev !== null) {
        const p = this.prevById.get(s.id);
        if (p !== undefined) {
          dst.x = lerp(p.x, s.x, alpha);
          dst.y = lerp(p.y, s.y, alpha);
        }
      }
    }
    // Trim the pool to this frame's sprite count (keeps backing store).
    if (out.length !== src.length) out.length = src.length;
    return out;
  }

  /**
   * Returns the interpolated pixel position of the farmer with `id`, or null
   * if not found. Used by the focus-camera system to follow a farmer.
   */
  getFarmerInterpolatedPos(id: number): { x: number; y: number } | null {
    const sprites = this.getInterpolatedSprites();
    for (const s of sprites) {
      if (s.id === id && s.interpolate) {
        return { x: s.x, y: s.y };
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Data getters (forwarded from latest snapshot)
  // ---------------------------------------------------------------------------

  get observer(): ObserverSnapshot | null {
    return this.currentSnapshot?.observer ?? null;
  }

  get leaderboard(): LeaderboardRow[] {
    return this.currentSnapshot?.leaderboard ?? [];
  }

  get slate(): ShopOffer[] {
    return (this.currentSnapshot?.slate ?? []) as ShopOffer[];
  }

  get meets(): RenderSnapshot["meets"] {
    return this.currentSnapshot?.meets ?? [];
  }

  get events(): RenderSnapshot["events"] {
    return this.currentSnapshot?.events ?? [];
  }

  get day(): number {
    return this.currentSnapshot?.day ?? 0;
  }

  get tick(): number {
    return this.currentSnapshot?.tick ?? 0;
  }

  get entityCount(): number {
    return this.currentSnapshot?.entityCount ?? 0;
  }

  get gameOver(): boolean {
    return this.currentSnapshot?.gameOver ?? false;
  }

  get finalSummary(): FinalStandingRow[] | null {
    return this.currentSnapshot?.finalSummary ?? null;
  }

  get recap(): RunRecap | null {
    return this.currentSnapshot?.recap ?? null;
  }

  get shock(): RenderSnapshot["shock"] {
    return this.currentSnapshot?.shock ?? null;
  }

  get playerHotbar(): RenderSnapshot["playerHotbar"] {
    return this.currentSnapshot?.playerHotbar ?? null;
  }

  get playerInventory(): RenderSnapshot["playerInventory"] {
    return this.currentSnapshot?.playerInventory ?? null;
  }

  /** Brief 37 — trust matrix for the relationship grid panel. */
  get relationships(): RelationshipMatrixData {
    return this.currentSnapshot?.relationships ?? { farmers: [], trust: {} };
  }

  /** Brief 37 — active named rivalries and alliances (resolved names). */
  get rivalries(): SnapshotRivalry[] {
    return this.currentSnapshot?.rivalries ?? [];
  }

  /** Brief 39 — per-farmer wealth time series for the wealth-over-time graph. */
  get wealthSeries(): SnapshotWealthSeries[] {
    return this.cachedWealthSeries;
  }
}
