/**
 * sim-client.ts — main-thread facade for the sim Web Worker.
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
  FinalStandingRow,
} from "./snapshot";
import type { ObserverSnapshot } from "../ui/observer";
import type { LeaderboardRow } from "../ui/leaderboard";
import type { ShopOffer } from "../agents/shop-slate";
import type { Canvas2dSprite } from "@engine/core";

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class SimClient {
  private readonly worker: Worker;

  private prevSnapshot: RenderSnapshot | null = null;
  private currentSnapshot: RenderSnapshot | null = null;

  /** performance.now() when the current snapshot arrived. */
  private lastSnapshotArrivalMs = 0;

  /** ms between ticks (1000 / tickRateHz), set in init(). */
  private msPerTick = 50;

  private staticLayerCallback: ((msg: WorkerStaticLayerMsg) => void) | null = null;
  private snapshotCallback: ((snap: RenderSnapshot) => void) | null = null;

  constructor() {
    this.worker = new Worker(new URL("./sim-worker.ts", import.meta.url), {
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
        this.snapshotCallback?.(msg.snapshot);
      }
    };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** Send the init message to start the sim. */
  init(opts: Omit<WorkerInitMsg, "type">): void {
    this.msPerTick = 1000 / opts.tickRateHz;
    const msg: WorkerInitMsg = { type: "init", ...opts };
    this.worker.postMessage(msg);
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

  /** Terminate the worker (hard stop). */
  terminate(): void {
    this.worker.terminate();
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
   */
  getInterpolatedSprites(): SnapshotSprite[] {
    const current = this.currentSnapshot;
    if (current === null) return [];

    const now = performance.now();
    const alpha = clamp(
      (now - this.lastSnapshotArrivalMs) / this.msPerTick,
      0,
      1,
    );

    const prev = this.prevSnapshot;

    // Build a lookup from id → prev sprite for the interpolated ones.
    const prevById = new Map<number, SnapshotSprite>();
    if (prev !== null) {
      for (const s of prev.sprites) {
        if (s.interpolate && s.id !== null) {
          prevById.set(s.id, s);
        }
      }
    }

    return current.sprites.map((s) => {
      if (!s.interpolate || s.id === null || prev === null) return s;
      const p = prevById.get(s.id);
      if (p === undefined) return s;
      return {
        ...s,
        x: lerp(p.x, s.x, alpha),
        y: lerp(p.y, s.y, alpha),
      };
    });
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

  /**
   * Returns a Canvas2dSprite[] from the current interpolated sprite list,
   * ready to push into the renderer. Width/height default to TILE (16).
   */
  getCanvas2dSprites(): Canvas2dSprite[] {
    const TILE = 16;
    return this.getInterpolatedSprites().map((s) => ({
      x: s.x,
      y: s.y,
      width: TILE,
      height: TILE,
      frame: s.frame,
      rotation: s.rotation,
      layer: s.layer,
      alpha: s.alpha,
    }));
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

  get shock(): RenderSnapshot["shock"] {
    return this.currentSnapshot?.shock ?? null;
  }
}
