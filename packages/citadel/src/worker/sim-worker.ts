/**
 * Citadel sim worker — runs the deterministic scheduler at 20 ticks/sec,
 * posting a RenderSnapshot after each tick.
 *
 * Phase 1: handles "command" messages, includes buildings in the snapshot.
 * Terrain is static and sent once at startup via the "ready" message.
 */
import { bootstrapSim } from "@citadel/sim-core/sim-bootstrap";
import type { WorkerInbound, WorkerOutbound } from "@citadel/sim-core/snapshot";

let paused = false;
let speed = 1;
let intervalId: ReturnType<typeof setInterval> | null = null;
let tick = 0;

const DEFAULT_SEED = 0x1a2b3c4d;
const DEFAULT_TICKS_PER_DAY = 20;

function startLoop(ticksPerDay: number, dayClock: { day: number }): void {
  if (intervalId !== null) clearInterval(intervalId);

  const msPerTick = 1000 / (20 * speed);

  intervalId = setInterval(() => {
    if (paused) return;
    scheduler.tick({ tick });
    tick++;

    const snapshot: WorkerOutbound = {
      type: "snapshot",
      snapshot: {
        tick,
        day: dayClock.day,
        speed,
        buildings: getBuildings(),
      },
    };
    self.postMessage(snapshot);
  }, msPerTick);
}

let scheduler: ReturnType<typeof bootstrapSim>["scheduler"];
let dayClock: ReturnType<typeof bootstrapSim>["dayClock"];
let commands: ReturnType<typeof bootstrapSim>["commands"];
let getBuildings: ReturnType<typeof bootstrapSim>["getBuildings"];

self.onmessage = (event: MessageEvent<WorkerInbound>) => {
  const msg = event.data;
  switch (msg.type) {
    case "init": {
      const result = bootstrapSim({
        seed: msg.seed,
        ticksPerDay: msg.ticksPerDay,
        maxDays: 365,
      });
      scheduler = result.scheduler;
      dayClock = result.dayClock;
      commands = result.commands;
      getBuildings = result.getBuildings;
      tick = 0;
      paused = false;
      speed = 1;

      const ready: WorkerOutbound = { type: "ready" };
      self.postMessage(ready);

      startLoop(msg.ticksPerDay, dayClock);
      break;
    }
    case "pause": {
      paused = true;
      break;
    }
    case "resume": {
      paused = false;
      break;
    }
    case "speed": {
      speed = msg.multiplier;
      // Restart the interval with the new speed
      if (intervalId !== null && scheduler) {
        startLoop(DEFAULT_TICKS_PER_DAY, dayClock);
      }
      break;
    }
    case "command": {
      // Enqueue into the command queue; CommandSystem will drain it next tick.
      commands.enqueue(msg.command);
      break;
    }
  }
};
