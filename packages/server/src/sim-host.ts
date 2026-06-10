/**
 * sim-host.ts — owns one ECS world + sim loop, transport-agnostic.
 *
 * This is the Node port of the browser sim Web Worker
 * (packages/farm-valley/src/worker/sim-worker.ts). The tick body, pacing,
 * pause/speed/step, skip-to-highlight, season re-bake, shock subscription, and
 * player-input handling are ALL ported unchanged — only the I/O differs:
 *
 *   worker `self.postMessage(msg)`  → host `send(msg)` callback
 *   worker `self.onmessage`         → host `handleInbound(msg)` method
 *
 * `setInterval` pacing is host scheduling (wall-clock), not sim logic. The sim
 * is deterministic and depends only on the tick COUNT, so running it from Node
 * with a socket transport does not introduce any nondeterminism. A run started
 * with a given seed produces byte-identical output to the browser worker (both
 * use the WASM pathfinder — see the JS/WASM divergence note in the corpus).
 */

import { bootstrapSim } from "@farm/sim-core/sim-bootstrap";
import { buildStaticLayerSprites } from "@farm/sim-core/render-systems";
import { WORLD_WIDTH, WORLD_HEIGHT } from "@farm/sim-core/world/regions";
import {
  buildRenderSnapshot,
  HIGHLIGHT_THRESHOLD,
  SnapshotSpriteState,
} from "@farm/sim-core/snapshot-builder";
import {
  ONT_SIMULATION,
  type ShockBody,
  seasonForDay,
  type Season,
} from "@farm/sim-core/protocols";
import { shouldStopSkip, SKIP_MAX_DAYS } from "@farm/sim-core/sim-worker-skip";
import type {
  WorkerInbound,
  WorkerOutbound,
  WorkerInitMsg,
  WorkerStaticLayerMsg,
  WorkerSnapshotMsg,
  WorkerProfileMsg,
} from "@farm/sim-core/protocol";
import type { SnapshotShock } from "@farm/sim-core/snapshot";
import { createPathfinderFromBytes, Profiler } from "@engine/core";
import type { PathfinderLike } from "@farm/sim-core/sim-bootstrap";

const TILE = 16;
const PROFILE_REPORT_EVERY = 60;

/** Callback the host uses to emit a message toward the connected client. */
export type SendFn = (msg: WorkerOutbound) => void;

export interface SimHostOptions {
  /**
   * Pathfinder for TravelSystem. The server passes the WASM pathfinder (to match
   * the browser); tests may pass a JsPathfinder. If null, TravelSystem is omitted
   * and travel-gated actions no-op (same as the worker without WASM).
   */
  pathfinder?: PathfinderLike | null;
  /** Optionally instantiate the WASM pathfinder from these bytes instead. */
  pathfinderWasm?: ArrayBuffer | null;
}

/**
 * One running simulation. Construct with a `send` callback, call `start(init)`
 * once with the run parameters, feed control/input messages via `handleInbound`,
 * and `stop()` (or rely on the gameOver auto-stop) to end it.
 */
export class SimHost {
  private readonly send: SendFn;
  private readonly opts: SimHostOptions;

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  // Playback state (wall-clock pacing only — never affects what a tick computes).
  private paused = false;
  private speedMultiplier = 1;
  private pendingStep = false;
  private pendingSkipToHighlight = false;

  private readonly profiler = new Profiler();

  // Bound in start(); null before the run begins.
  private runOneTick: (() => void) | null = null;
  private getEventFeedInfo:
    | (() => { length: number; newestDrama: number })
    | null = null;
  private applyInput:
    | ((
        moveX: "left" | "right" | null,
        moveY: "up" | "down" | null,
        action: boolean,
        selectSlot: number | null,
      ) => void)
    | null = null;

  private ticksPerDay = 1200;

  constructor(send: SendFn, opts: SimHostOptions = {}) {
    this.send = send;
    this.opts = opts;
  }

  /** Handle a main→sim message (the WorkerInbound protocol). */
  handleInbound(msg: WorkerInbound): void {
    switch (msg.type) {
      case "stop":
        this.stop();
        return;
      case "pause":
        this.paused = msg.paused;
        return;
      case "speed":
        this.speedMultiplier =
          Number.isFinite(msg.multiplier) && msg.multiplier >= 1
            ? Math.floor(msg.multiplier)
            : 1;
        return;
      case "step":
        this.pendingStep = true;
        return;
      case "profile":
        this.profiler.enabled = msg.enabled;
        if (!msg.enabled) this.profiler.reset();
        return;
      case "input":
        this.applyInput?.(msg.moveX, msg.moveY, msg.action, msg.selectSlot);
        return;
      case "skipToHighlight":
        this.pendingSkipToHighlight = true;
        return;
      case "init":
        void this.start(msg);
        return;
    }
  }

  /** Stop the loop and release the interval. Idempotent. */
  stop(): void {
    this.stopped = true;
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async resolvePathfinder(
    init: WorkerInitMsg,
  ): Promise<PathfinderLike | null> {
    // Precedence: an explicitly-injected pathfinder (tests) → bytes from opts →
    // bytes on the init message → none.
    if (this.opts.pathfinder) return this.opts.pathfinder;
    const bytes = this.opts.pathfinderWasm ?? init.pathfinderWasm ?? null;
    if (bytes) {
      try {
        return (await createPathfinderFromBytes(
          bytes,
        )) as unknown as PathfinderLike;
      } catch (e) {
        console.warn("[sim-host] pathfinder failed to load:", e);
      }
    }
    return null;
  }

  /** Boot the sim for this run and begin ticking. Called once, on `init`. */
  private async start(init: WorkerInitMsg): Promise<void> {
    const { seed, ticksPerDay, maxDays, tickRateHz } = init;
    this.ticksPerDay = ticksPerDay;

    const pathfinder = await this.resolvePathfinder(init);

    const {
      world,
      bus,
      scheduler,
      dayClock,
      meetIndicators,
      eventFeed,
      runHistory,
      rivalry,
    } = bootstrapSim({ seed, ticksPerDay, maxDays, pathfinder });

    // Wire player (Pip) input onto the player entity for PlayerControlSystem.
    this.applyInput = (moveX, moveY, action, selectSlot) => {
      for (const e of world.query("player")) {
        e.player!.pendingMoveX = moveX;
        e.player!.pendingMoveY = moveY;
        if (action) e.player!.pendingAction = true;
        if (selectSlot !== null) e.player!.selectedSlot = selectSlot;
        break; // single player entity
      }
    };

    // Static-layer sprites: baked for the current season, re-posted on a season
    // change (4× per run). The client re-bakes its backdrop from each message.
    let lastBakedSeason = seasonForDay(dayClock.day);
    const postStaticLayer = (season: Season): void => {
      const staticSprites = buildStaticLayerSprites(world, season);
      const staticMsg: WorkerStaticLayerMsg = {
        type: "static-layer",
        sprites: staticSprites,
        worldWidthPx: WORLD_WIDTH * TILE,
        worldHeightPx: WORLD_HEIGHT * TILE,
        season,
      };
      this.send(staticMsg);
    };
    postStaticLayer(lastBakedSeason);

    // Surface the mid-game shock once, in the snapshot it belongs to.
    let pendingShock: SnapshotShock | null = null;
    bus.subscribeOntology(ONT_SIMULATION.SHOCK, (busMsg) => {
      const b = busMsg.body as unknown as ShockBody;
      pendingShock = {
        kind: b.kind,
        day: b.day,
        targetFarmerId: b.targetFarmerId,
        targetName: b.targetName,
        plotsWiped: b.plotsWiped,
      };
    });

    let tick = 0;

    // Per-run render memo (facing/bubble), so this connection's sim never shares
    // cosmetic state with another sim running in the same server process.
    const spriteState = new SnapshotSpriteState();

    this.getEventFeedInfo = () => {
      const events = eventFeed.recent();
      const last = events[events.length - 1];
      return { length: events.length, newestDrama: last?.drama ?? 0 };
    };

    // Single deterministic tick. Depends only on the tick COUNT. pause/speed/step
    // all funnel through here so the advance is byte-identical regardless of pacing.
    this.runOneTick = () => {
      if (this.stopped) return;

      for (const e of world.query("transform")) {
        e.transform.prevX = e.transform.x;
        e.transform.prevY = e.transform.y;
      }

      try {
        this.profiler.time("tick", () => scheduler.tick({ tick }));
        bus.notifySubscribers();

        const snapshot = this.profiler.time("snapshot.build", () =>
          buildRenderSnapshot(
            world,
            dayClock,
            meetIndicators,
            eventFeed,
            tick,
            maxDays,
            pendingShock,
            runHistory.history(),
            rivalry,
            spriteState,
          ),
        );

        pendingShock = null;

        if (this.profiler.enabled) {
          this.profiler.add("snapshot.bytes", JSON.stringify(snapshot).length);
        }

        const snapshotMsg: WorkerSnapshotMsg = { type: "snapshot", snapshot };
        this.send(snapshotMsg);

        const seasonNow = seasonForDay(dayClock.day);
        if (seasonNow !== lastBakedSeason) {
          lastBakedSeason = seasonNow;
          postStaticLayer(seasonNow);
        }

        if (this.profiler.enabled && tick % PROFILE_REPORT_EVERY === 0) {
          const profileMsg: WorkerProfileMsg = {
            type: "profile",
            tick,
            report: this.profiler.report(),
          };
          this.send(profileMsg);
        }

        if (snapshot.gameOver) this.stop();
      } catch (err) {
        console.error(`[sim] tick ${tick} faulted; skipping snapshot`, err);
        pendingShock = null;
      }

      tick += 1;
    };

    const msPerTick = 1000 / tickRateHz;
    this.intervalId = setInterval(() => this.onInterval(), msPerTick);
  }

  /** One interval fire — the host pacing loop, ported from the worker. */
  private onInterval(): void {
    if (this.stopped || this.runOneTick === null) return;

    // Skip-to-highlight: run ticks until a high-drama event or the safety cap.
    if (this.pendingSkipToHighlight && this.getEventFeedInfo !== null) {
      this.pendingSkipToHighlight = false;
      const capTicks = SKIP_MAX_DAYS * this.ticksPerDay;
      let skipped = 0;
      while (!this.stopped && skipped < capTicks) {
        const { length: prevLen } = this.getEventFeedInfo();
        this.runOneTick();
        const { length: curLen, newestDrama } = this.getEventFeedInfo();
        skipped += 1;
        if (shouldStopSkip(prevLen, curLen, newestDrama, HIGHLIGHT_THRESHOLD)) {
          break;
        }
      }
      return;
    }

    if (this.paused) {
      if (this.pendingStep) {
        this.pendingStep = false;
        this.runOneTick();
      }
      return;
    }

    for (let i = 0; i < this.speedMultiplier && !this.stopped; i += 1) {
      this.runOneTick();
    }
  }
}
