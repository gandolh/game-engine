

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
  SimInbound,
  SimOutbound,
  SimInitMsg,
  SimStaticLayerMsg,
  SimSnapshotMsg,
  SimProfileMsg,
  SimFaultMsg,
} from "@farm/sim-core/protocol";
import type { SnapshotShock } from "@farm/sim-core/snapshot";
import { createPathfinderFromBytes, Profiler } from "@engine/core";
import type { PathfinderLike } from "@farm/sim-core/sim-bootstrap";
import type { Scheduler } from "@engine/core/sim";

const TILE = 16;
const PROFILE_REPORT_EVERY = 60;
const MAX_SPEED_MULTIPLIER = 8;
const MIN_TICK_RATE_HZ = 1;
const MAX_TICK_RATE_HZ = 60;

/**
 * Wall-clock budget for one slice of a "skip to highlight" drain (audit-41).
 *
 * `SKIP_MAX_DAYS * ticksPerDay` is **36 000 ticks** at the production `ticksPerDay = 1200`, and
 * the drain used to run all of them inside a single `setInterval` callback. Node's event loop is
 * blocked for that whole stretch, and `RunRegistry` puts one `SimHost` per run in ONE process — so
 * one player pressing Skip in a quiet stretch froze every other connected player's sim, sent no
 * snapshots, and could time their sockets out. A local stutter became a shared-server outage.
 *
 * 12 ms is under one tick period at `MAX_TICK_RATE_HZ` (16.7 ms), so the loop always yields inside
 * a frame even at the fastest rate the host allows.
 *
 * THE TRADE, ACCEPTED: skipping is no longer instant — it now spreads over several interval fires.
 * A responsive server that skips across three fires beats a frozen one that skips in a single fire.
 *
 * This is PACING ONLY. The clock never decides *what* a tick does, only where the drain pauses: the
 * same logical ticks run, in the same order, with the same stop condition, so a skip's sim outcome
 * is byte-identical to the unsliced version. (Determinism is load-bearing here — a tick's output
 * must remain a pure function of the tick count.)
 */
const SKIP_SLICE_BUDGET_MS = 12;

export type SendFn = (msg: SimOutbound) => void;

export function isValidSwapIndex(i: number, length: number): boolean {
  return Number.isInteger(i) && i >= 0 && i < length;
}

function clampTickRateHz(hz: number): number {
  if (!Number.isFinite(hz)) return MIN_TICK_RATE_HZ;
  return Math.min(MAX_TICK_RATE_HZ, Math.max(MIN_TICK_RATE_HZ, hz));
}

export interface SimHostOptions {

  pathfinder?: PathfinderLike | null;

  /**
   * Test seam: the wall clock the skip drain slices against. Defaults to `Date.now`. Injectable so
   * a test can drive slice boundaries exactly rather than racing a real clock — and so the one
   * place this host reads wall time is explicit. NEVER read inside a tick.
   */
  now?: () => number;

  pathfinderWasm?: ArrayBuffer | null;

  /**
   * Test seam only: invoked with the freshly-built `Scheduler` before the
   * tick loop starts, so tests can `scheduler.add(...)` a throwing system
   * and exercise the tick-fault policy (see decisions.md) without touching
   * @farm/sim-core systems themselves. Never set in production.
   */
  onSchedulerReady?: (scheduler: Scheduler) => void;
}

export class SimHost {
  private readonly send: SendFn;
  private readonly opts: SimHostOptions;

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  private paused = false;
  private speedMultiplier = 1;
  private pendingStep = false;
  private pendingSkipToHighlight = false;
  /**
   * Logical ticks of drain still owed to an in-flight "skip to highlight", or 0 when none is
   * running. Held as STATE so the drain can be resumed on the next interval fire instead of
   * running to completion inside one callback (audit-41).
   */
  private skipTicksRemaining = 0;

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
        actionTile: { x: number; y: number } | null,
      ) => void)
    | null = null;
  private applySwapSlots: ((a: number, b: number) => void) | null = null;

  private ticksPerDay = 1200;

  constructor(send: SendFn, opts: SimHostOptions = {}) {
    this.send = send;
    this.opts = opts;
  }

  handleInbound(msg: SimInbound): void {
    // Shape guard only (audit-42). FIELD validation is the wire boundary's job — see
    // `validate-inbound.ts`, which is where every frame from a socket is narrowed before it gets
    // here, and deliberately NOT smeared across these handlers or into the sim. This one check
    // exists because `handleInbound` is a public method the registry calls directly: a `null`
    // frame reaching it dereferenced `msg.type` and threw, which on the publicly reachable server
    // surfaces as an `uncaughtException`.
    if (typeof msg !== "object" || msg === null) return;
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
            ? Math.min(MAX_SPEED_MULTIPLIER, Math.floor(msg.multiplier))
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
        this.applyInput?.(msg.moveX, msg.moveY, msg.action, msg.selectSlot, msg.actionTile ?? null);
        return;
      case "swap-slots":
        this.applySwapSlots?.(msg.a, msg.b);
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
    this.skipTicksRemaining = 0;
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async resolvePathfinder(
    init: SimInitMsg,
  ): Promise<PathfinderLike | null> {

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

  private async start(init: SimInitMsg): Promise<void> {
    try {
      await this.startUnsafe(init);
    } catch (err) {
      console.error("[sim-host] start() faulted; run did not start", err);
      this.stop();
    }
  }

  private async startUnsafe(init: SimInitMsg): Promise<void> {
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

    this.opts.onSchedulerReady?.(scheduler);

    this.applyInput = (moveX, moveY, action, selectSlot, actionTile) => {
      for (const e of world.query("player")) {
        e.player!.pendingMoveX = moveX;
        e.player!.pendingMoveY = moveY;
        if (action) e.player!.pendingAction = true;
        if (selectSlot !== null) e.player!.selectedSlot = selectSlot;
        e.player!.pendingActionTile = actionTile;
        break; 
      }
    };

    this.applySwapSlots = (a, b) => {
      for (const e of world.query("player")) {
        const slots = e.player!.itemSlots;
        if (!slots) break;
        if (!isValidSwapIndex(a, slots.length) || !isValidSwapIndex(b, slots.length)) break;
        const tmp = slots[a]!;
        slots[a] = slots[b]!;
        slots[b] = tmp;
        break; 
      }
    };

    let lastBakedSeason = seasonForDay(dayClock.day);
    const postStaticLayer = (season: Season): void => {
      const staticSprites = buildStaticLayerSprites(world, season);
      const staticMsg: SimStaticLayerMsg = {
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

        const snapshotMsg: SimSnapshotMsg = { type: "snapshot", snapshot };
        this.send(snapshotMsg);

        const seasonNow = seasonForDay(dayClock.day);
        if (seasonNow !== lastBakedSeason) {
          lastBakedSeason = seasonNow;
          postStaticLayer(seasonNow);
        }

        if (this.profiler.enabled && tick % PROFILE_REPORT_EVERY === 0) {
          const profileMsg: SimProfileMsg = {
            type: "profile",
            tick,
            report: this.profiler.report(),
          };
          this.send(profileMsg);
        }

        if (snapshot.gameOver) this.stop();
      } catch (err) {
        // A system threw partway through this tick: 1..N-1 already wrote
        // their mutations, N..last never ran. That's a world state no
        // clean tick could ever produce, so — unlike a normal caught
        // error — we do NOT log-and-continue: the run halts here, the
        // same way start() halts on a startup fault above. `tick` is
        // deliberately left un-advanced and no snapshot is sent for it;
        // the last "snapshot" message the client has is the last known
        // good state. See decisions.md ("Farm sim-host tick-fault policy").
        console.error(`[sim] tick ${tick} faulted; halting run`, err);
        pendingShock = null;
        const faultMsg: SimFaultMsg = {
          type: "fault",
          tick,
          message: err instanceof Error ? err.message : String(err),
        };
        this.send(faultMsg);
        this.stop();
        return;
      }

      tick += 1;
    };

    const msPerTick = 1000 / clampTickRateHz(tickRateHz);
    this.intervalId = setInterval(() => this.onInterval(), msPerTick);
  }

  private onInterval(): void {
    if (this.stopped || this.runOneTick === null) return;

    // A freshly requested skip arms the full tick budget; an in-flight one keeps what is left.
    if (this.pendingSkipToHighlight && this.getEventFeedInfo !== null) {
      this.pendingSkipToHighlight = false;
      this.skipTicksRemaining = SKIP_MAX_DAYS * this.ticksPerDay;
    }

    if (this.skipTicksRemaining > 0 && this.getEventFeedInfo !== null) {
      this.drainSkipSlice(this.getEventFeedInfo, this.runOneTick);
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

  /**
   * Run one wall-clock-bounded slice of an in-flight skip drain, then return so the event loop —
   * and therefore every OTHER run in this process — gets a turn.
   *
   * The stop condition is evaluated per tick, exactly as it was in the unsliced loop, so the drain
   * ends on the same logical tick it always did; only where it PAUSES differs.
   */
  private drainSkipSlice(
    getInfo: () => { length: number; newestDrama: number },
    runOneTick: () => void,
  ): void {
    const now = this.opts.now ?? Date.now;
    const deadline = now() + SKIP_SLICE_BUDGET_MS;

    while (this.skipTicksRemaining > 0 && !this.stopped) {
      const { length: prevLen } = getInfo();
      runOneTick();
      const { length: curLen, newestDrama } = getInfo();
      this.skipTicksRemaining -= 1;
      if (shouldStopSkip(prevLen, curLen, newestDrama, HIGHLIGHT_THRESHOLD)) {
        this.skipTicksRemaining = 0;
        return;
      }
      // Checked AFTER at least one tick, so a slice always makes progress even if the budget is
      // already spent — otherwise a slow tick could livelock the drain.
      if (now() >= deadline) return;
    }
    this.skipTicksRemaining = 0;
  }

  /** Test seam: logical ticks still owed to an in-flight skip (0 when none is running). */
  skipTicksPending(): number {
    return this.skipTicksRemaining;
  }
}
