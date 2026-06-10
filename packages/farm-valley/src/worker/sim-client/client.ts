/**
 * client.ts — main-thread facade for the sim Web Worker.
 *
 * SimClient:
 *  - Spawns the worker and sends WorkerInitMsg.
 *  - Receives WorkerStaticLayerMsg (once) and WorkerSnapshotMsg (per tick).
 *  - Keeps the two most-recent snapshots (prev + current) for interpolation.
 *  - Exposes interpolated sprites: farmer sprites are lerped between prev and
 *    current positions; all other sprites use the current position as-is.
 *  - Exposes accessor methods so the render loop can pull observer/leaderboard/
 *    slate/meets/overlay data without touching the worker protocol directly.
 *
 * Interpolation note: `performance.now()` is used for the arrival timestamp.
 * This is *display timing* on the main thread — not sim logic — so it is
 * correct to use wall-clock time here (determinism is a sim-side property).
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
} from "@farm/sim-core/snapshot";
import type { ProfileReport } from "@engine/core";
import type { ObserverSnapshot } from "../../ui/observer";
import type { LeaderboardRow } from "../../ui/leaderboard";
import type { ShopOffer } from "@farm/sim-core/agents/shop-slate";
import { clamp, lerp, smoothstep, copySprite } from "./interp";

export class SimClient {
  private readonly worker: Worker;

  private prevSnapshot: RenderSnapshot | null = null;
  private currentSnapshot: RenderSnapshot | null = null;

  /** performance.now() when the current snapshot arrived. */
  private lastSnapshotArrivalMs = 0;

  /** ms between ticks (1000 / tickRateHz), set in init(). */
  private msPerTick = 50;

  /**
   * Render delay (the "interpolate in the past" margin). We render one full tick
   * behind the newest snapshot's arrival so there is always a known next sample
   * to interpolate toward — when a snapshot arrives a few ms late, we glide
   * through the gap instead of freezing pinned at alpha=1. Costs ~1 tick of
   * display latency (50 ms), imperceptible for a watch-only game.
   */
  private get renderDelayMs(): number {
    return this.msPerTick;
  }

  private staticLayerCallback: ((msg: WorkerStaticLayerMsg) => void) | null = null;
  private snapshotCallback: ((snap: RenderSnapshot) => void) | null = null;
  private profileCallback: ((tick: number, report: ProfileReport) => void) | null = null;

  // T1.2 — interpolation pooling. getInterpolatedSprites runs every render
  // frame (~60 Hz), so all of this is reused rather than allocated per call:
  //  - prevById is rebuilt once per arriving snapshot (in onmessage), not per
  //    frame, and indexes the PREV snapshot's interpolated sprites by id.
  //  - interpOut is a pooled output array; we mutate its sprite objects in place
  //    and only grow it when the sprite count rises.
  private readonly prevById = new Map<number, SnapshotSprite>();
  private interpOut: SnapshotSprite[] = [];

  constructor() {
    this.worker = new Worker(new URL("../sim-worker.ts", import.meta.url), {
      type: "module",
    });

    this.worker.onmessage = (event: MessageEvent<WorkerOutbound>) => {
      const msg = event.data;
      if (msg.type === "static-layer") {
        this.staticLayerCallback?.(msg);
      } else if (msg.type === "snapshot") {
        this.prevSnapshot = this.currentSnapshot;
        this.currentSnapshot = msg.snapshot;
        this.lastSnapshotArrivalMs = performance.now();
        // T1.2 — rebuild the prev-sprite id index once per snapshot (not per
        // frame). prevSnapshot is the just-superseded current snapshot.
        this.prevById.clear();
        const prev = this.prevSnapshot;
        if (prev !== null) {
          for (const s of prev.sprites) {
            if (s.interpolate && s.id !== null) this.prevById.set(s.id, s);
          }
        }
        this.snapshotCallback?.(msg.snapshot);
      } else if (msg.type === "profile") {
        this.profileCallback?.(msg.tick, msg.report);
      }
    };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** Send the init message to start the sim. Fetches WASM bytes for transfer. */
  init(opts: Omit<WorkerInitMsg, "type">): void {
    this.msPerTick = 1000 / opts.tickRateHz;
    // Fetch pathfinding WASM bytes and transfer them (zero-copy) to the worker.
    // Falls back gracefully if the fetch fails — sim runs without pathfinding.
    void fetch(`${import.meta.env.BASE_URL}wasm/pathfinding.wasm`)
      .then(r => r.arrayBuffer())
      .then(buf => {
        const msg: WorkerInitMsg = { type: "init", ...opts, pathfinderWasm: buf };
        this.worker.postMessage(msg, [buf]); // transfer ownership
      })
      .catch(() => {
        // WASM unavailable — send init without pathfinder (farmers stay put).
        const msg: WorkerInitMsg = { type: "init", ...opts };
        this.worker.postMessage(msg);
      });
  }

  /** Stop the sim worker loop. */
  stop(): void {
    const msg: WorkerInbound = { type: "stop" };
    this.worker.postMessage(msg);
  }

  // ---------------------------------------------------------------------------
  // Playback controls (wall-clock pacing only — never change sim state)
  // ---------------------------------------------------------------------------

  /** Pause or resume sim advance. While paused no snapshots arrive. */
  setPaused(paused: boolean): void {
    const msg: WorkerInbound = { type: "pause", paused };
    this.worker.postMessage(msg);
  }

  /**
   * Set the tick multiplier (1, 2, 4). The worker runs `multiplier` ticks per
   * interval fire; each still posts one snapshot, so the client's
   * arrival-timestamp interpolation stays correct (snapshots just arrive
   * faster). No change to msPerTick is needed.
   */
  setSpeed(multiplier: number): void {
    const msg: WorkerInbound = { type: "speed", multiplier };
    this.worker.postMessage(msg);
  }

  /** While paused, advance exactly one tick then stay paused. */
  step(): void {
    const msg: WorkerInbound = { type: "step" };
    this.worker.postMessage(msg);
  }

  /**
   * Fast-forward until the next high-drama event (drama >= HIGHLIGHT_THRESHOLD)
   * or a safety cap. The worker resumes at the prior pace after stopping.
   * Brief 40.
   */
  skipToHighlight(): void {
    const msg: WorkerInbound = { type: "skipToHighlight" };
    this.worker.postMessage(msg);
  }

  /**
   * Send player (Pip) input to the worker. `moveX`/`moveY` are the held
   * horizontal/vertical axes (both set = diagonal; null = released); `action`
   * requests the selected-slot field action; `selectSlot` (0-based, or null)
   * switches the active hotbar slot. The worker buffers these onto the player
   * entity for PlayerControlSystem to consume.
   */
  sendInput(
    moveX: "left" | "right" | null,
    moveY: "up" | "down" | null,
    action: boolean,
    selectSlot: number | null = null,
  ): void {
    const msg: WorkerInbound = { type: "input", moveX, moveY, action, selectSlot };
    this.worker.postMessage(msg);
  }

  /** Terminate the worker (hard stop). */
  terminate(): void {
    this.worker.terminate();
  }

  /**
   * Turn worker-side profiling on/off (P0). While on, the worker periodically
   * posts a profile report (tick + snapshot timings + payload size) consumed via
   * onProfile(). Diagnostic only — does not affect the sim.
   */
  setProfiling(enabled: boolean): void {
    const msg: WorkerInbound = { type: "profile", enabled };
    this.worker.postMessage(msg);
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
    return this.currentSnapshot?.wealthSeries ?? [];
  }
}
