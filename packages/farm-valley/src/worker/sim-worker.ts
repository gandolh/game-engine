/// <reference lib="webworker" />
/**
 * sim-worker.ts — Web Worker that owns the ECS world and drives the sim loop.
 *
 * Receives WorkerInitMsg from the main thread, bootstraps the sim, emits the
 * static-layer sprites once, then ticks at `tickRateHz` Hz using setInterval.
 * Each tick it posts a WorkerSnapshotMsg with the fresh RenderSnapshot.
 *
 * setInterval is *host scheduling* (wall-clock pacing), not sim logic. The sim
 * itself is fully deterministic and only depends on the tick COUNT, not real
 * time — so this does not introduce any nondeterminism into the sim.
 *
 * The worker calls bus.notifySubscribers() after each scheduler.tick() so that
 * bus subscribers (e.g. the shock narrator) fire. InboxDispatchSystem calls
 * bus.flush() inside scheduler.tick(), which moves inflight → deliverable;
 * notifySubscribers() then dispatches those deliverable messages to subscribers.
 */

import { bootstrapSim } from "../sim-bootstrap";
import { buildStaticLayerSprites } from "../render-systems";
import { WORLD_WIDTH, WORLD_HEIGHT } from "../world/regions";
import { buildRenderSnapshot } from "./snapshot-builder";
import { ONT_SIMULATION, type ShockBody } from "../protocols";
import { createPathfinderFromBytes, Profiler } from "@engine/core";
import type {
  WorkerInbound,
  WorkerStaticLayerMsg,
  WorkerSnapshotMsg,
  WorkerProfileMsg,
  SnapshotShock,
} from "./snapshot";

const TILE = 16;

// P0 profiling — worker-side sampler for scheduler.tick + snapshot build/size.
// Off by default; the main thread toggles it via a "profile" message. Diagnostic
// only (host timing), so it never affects what a tick computes.
const profiler = new Profiler();
// Emit a rolling report this often (in ticks) while profiling is enabled.
const PROFILE_REPORT_EVERY = 60;

let intervalId: ReturnType<typeof setInterval> | null = null;

// Playback state (wall-clock pacing only — never affects what a tick computes).
let paused = false;
// Tick multiplier: number of scheduler.tick iterations run per interval fire.
let speedMultiplier = 1;
// When set, advances exactly one tick on the next interval fire while paused.
let pendingStep = false;

// Bound at init() to run a single deterministic tick (+ its snapshot). pause/
// speed/step all reuse this, so the sim advance path is identical regardless of
// pacing — only HOW MANY times per wall-clock fire it runs differs.
let runOneTick: (() => void) | null = null;

// Bound at init() to apply a player-input message to the player entity. Null
// before init; input messages arriving early are dropped.
let applyInput:
  | ((
      moveX: "left" | "right" | null,
      moveY: "up" | "down" | null,
      action: boolean,
      selectSlot: number | null,
    ) => void)
  | null = null;

self.onmessage = (event: MessageEvent<WorkerInbound>) => {
  const msg = event.data;

  if (msg.type === "stop") {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
    return;
  }

  if (msg.type === "pause") {
    paused = msg.paused;
    return;
  }

  if (msg.type === "speed") {
    // Guard against bad values; default to 1x. Multiplier is a positive integer
    // number of ticks per fire.
    speedMultiplier =
      Number.isFinite(msg.multiplier) && msg.multiplier >= 1
        ? Math.floor(msg.multiplier)
        : 1;
    return;
  }

  if (msg.type === "step") {
    // One-shot: advance a single tick on the next fire while paused.
    pendingStep = true;
    return;
  }

  if (msg.type === "profile") {
    profiler.enabled = msg.enabled;
    if (!msg.enabled) profiler.reset();
    return;
  }

  if (msg.type === "input") {
    // Buffer player input onto the player entity for PlayerControlSystem.
    applyInput?.(msg.moveX, msg.moveY, msg.action, msg.selectSlot);
    return;
  }

  if (msg.type === "init") {
    void (async () => {
    const { seed, ticksPerDay, maxDays, tickRateHz } = msg;

    // Instantiate pathfinder inside the worker from transferred bytes.
    let pathfinder = null;
    if (msg.pathfinderWasm) {
      try {
        pathfinder = await createPathfinderFromBytes(msg.pathfinderWasm);
        console.info("[sim-worker] pathfinder loaded");
      } catch (e) {
        console.warn("[sim-worker] pathfinder failed to load:", e);
      }
    }

    const { world, bus, scheduler, dayClock, meetIndicators, eventFeed } = bootstrapSim({
      seed,
      ticksPerDay,
      maxDays,
      pathfinder,
    });

    // Wire player input. `move` is the HELD direction (or null on release); it
    // is written through unconditionally so releasing a key stops Pip — the
    // client only sends a message when the held direction changes (or on a
    // discrete action/slot event), and every such message carries the current
    // held direction, so this never spuriously clears a still-held key.
    // `action` latches (consumed once by PlayerControlSystem); `selectSlot`
    // switches the hotbar slot.
    applyInput = (moveX, moveY, action, selectSlot) => {
      for (const e of world.query("player")) {
        e.player!.pendingMoveX = moveX;
        e.player!.pendingMoveY = moveY;
        if (action) e.player!.pendingAction = true;
        if (selectSlot !== null) e.player!.selectedSlot = selectSlot;
        break; // single player entity
      }
    };

    // Build and post the static-layer sprites (backdrop tiles, fences, plot
    // dirt). These never change after world setup so they're baked once by
    // the main thread renderer.
    const staticSprites = buildStaticLayerSprites(world);
    const staticMsg: WorkerStaticLayerMsg = {
      type: "static-layer",
      sprites: staticSprites,
      worldWidthPx: WORLD_WIDTH * TILE,
      worldHeightPx: WORLD_HEIGHT * TILE,
    };
    self.postMessage(staticMsg);

    // Subscribe to the shock ontology so the snapshot can surface it once.
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
    let stopped = false;

    const msPerTick = 1000 / tickRateHz;

    // Single-tick body. Deterministic: depends only on the tick COUNT, never on
    // wall-clock time. pause/speed/step all funnel through here so the sim
    // advance is byte-identical regardless of pacing.
    runOneTick = () => {
      if (stopped) return;

      // Copy prevX/prevY so the main thread can interpolate between snapshots.
      for (const e of world.query("transform")) {
        e.transform.prevX = e.transform.x;
        e.transform.prevY = e.transform.y;
      }

      // Backstop: a fault inside scheduler.tick (e.g. a WASM pathfinder trap
      // not caught at its source) must not wedge the setInterval loop. Log it,
      // skip this tick's snapshot, and still advance the counter so the next
      // tick proceeds rather than re-running the faulted tick number.
      try {
        profiler.time("tick", () => scheduler.tick({ tick }));

        // Fire bus subscribers (InboxDispatchSystem flushed messages above, so
        // deliverable is populated; notifySubscribers dispatches to our shock
        // subscriber, among others).
        bus.notifySubscribers();

        const snapshot = profiler.time("snapshot.build", () =>
          buildRenderSnapshot(
            world,
            dayClock,
            meetIndicators,
            eventFeed,
            tick,
            maxDays,
            pendingShock,
          ),
        );

        // Clear pending shock — it fires exactly once in the snapshot it belongs to.
        pendingShock = null;

        // Approximate the structured-clone payload size (T1.1 baseline). Only
        // serialize when profiling is on — JSON.stringify is itself non-trivial.
        if (profiler.enabled) {
          profiler.add("snapshot.bytes", JSON.stringify(snapshot).length);
        }

        const snapshotMsg: WorkerSnapshotMsg = {
          type: "snapshot",
          snapshot,
        };
        self.postMessage(snapshotMsg);

        // Periodic rolling report to the main thread for the debug overlay.
        if (profiler.enabled && tick % PROFILE_REPORT_EVERY === 0) {
          const profileMsg: WorkerProfileMsg = {
            type: "profile",
            tick,
            report: profiler.report(),
          };
          self.postMessage(profileMsg);
        }

        if (snapshot.gameOver) {
          stopped = true;
          if (intervalId !== null) {
            clearInterval(intervalId);
            intervalId = null;
          }
        }
      } catch (err) {
        console.error(`[sim] tick ${tick} faulted; skipping snapshot`, err);
        pendingShock = null;
      }

      tick += 1;
    };

    intervalId = setInterval(() => {
      if (stopped || runOneTick === null) return;

      // Paused: do not advance the sim, except to honor a one-shot step.
      if (paused) {
        if (pendingStep) {
          pendingStep = false;
          runOneTick();
        }
        return;
      }

      // Running: advance `speedMultiplier` ticks this fire. Each call posts its
      // own snapshot so main-thread interpolation stays correct — more
      // snapshots simply arrive per second at higher speed.
      for (let i = 0; i < speedMultiplier && !stopped; i += 1) {
        runOneTick();
      }
    }, msPerTick);

    })(); // end async init IIFE
    return;
  }
};
