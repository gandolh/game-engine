// Transport-agnostic Node port of sim-worker.ts: postMessage→send callback, onmessage→handleInbound().
// setInterval is wall-clock pacing only; the sim depends solely on tick count (fully deterministic).
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
  /** WASM pathfinder (matches browser) or JsPathfinder (tests); null → travel no-ops. */
  pathfinder?: PathfinderLike | null;
  /** Instantiate pathfinder from these bytes instead of a pre-built instance. */
  pathfinderWasm?: ArrayBuffer | null;
}

export class SimHost {
  private readonly send: SendFn;
  private readonly opts: SimHostOptions;

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  // Wall-clock pacing only — never affects what a tick computes.
  private paused = false;
  private speedMultiplier = 1;
  private pendingStep = false;
  private pendingSkipToHighlight = false;

  private readonly profiler = new Profiler();

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
    // Precedence: injected instance → opts bytes → init bytes → none.
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

    this.applyInput = (moveX, moveY, action, selectSlot) => {
      for (const e of world.query("player")) {
        e.player!.pendingMoveX = moveX;
        e.player!.pendingMoveY = moveY;
        if (action) e.player!.pendingAction = true;
        if (selectSlot !== null) e.player!.selectedSlot = selectSlot;
        break; // single player entity
      }
    };

    // Re-post static layer on season change (4× per run); client re-bakes its backdrop.
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

    // Per-connection sprite state so concurrent sims never share cosmetic state.
    const spriteState = new SnapshotSpriteState();

    this.getEventFeedInfo = () => {
      const events = eventFeed.recent();
      const last = events[events.length - 1];
      return { length: events.length, newestDrama: last?.drama ?? 0 };
    };

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
