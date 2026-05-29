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
import type {
  WorkerInbound,
  WorkerStaticLayerMsg,
  WorkerSnapshotMsg,
  SnapshotShock,
} from "./snapshot";

const TILE = 16;

let intervalId: ReturnType<typeof setInterval> | null = null;

self.onmessage = (event: MessageEvent<WorkerInbound>) => {
  const msg = event.data;

  if (msg.type === "stop") {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
    return;
  }

  if (msg.type === "init") {
    const { seed, ticksPerDay, maxDays, tickRateHz } = msg;

    const { world, bus, scheduler, dayClock, meetIndicators } = bootstrapSim({
      seed,
      ticksPerDay,
      maxDays,
    });

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

    intervalId = setInterval(() => {
      if (stopped) return;

      // Copy prevX/prevY so the main thread can interpolate between snapshots.
      for (const e of world.query("transform")) {
        e.transform.prevX = e.transform.x;
        e.transform.prevY = e.transform.y;
      }

      scheduler.tick({ tick });

      // Fire bus subscribers (InboxDispatchSystem flushed messages above, so
      // deliverable is populated; notifySubscribers dispatches to our shock
      // subscriber, among others).
      bus.notifySubscribers();

      const snapshot = buildRenderSnapshot(
        world,
        dayClock,
        meetIndicators,
        tick,
        maxDays,
        pendingShock,
      );

      // Clear pending shock — it fires exactly once in the snapshot it belongs to.
      pendingShock = null;

      const snapshotMsg: WorkerSnapshotMsg = {
        type: "snapshot",
        snapshot,
      };
      self.postMessage(snapshotMsg);

      tick += 1;

      if (snapshot.gameOver) {
        stopped = true;
        if (intervalId !== null) {
          clearInterval(intervalId);
          intervalId = null;
        }
      }
    }, msPerTick);

    return;
  }
};
