/**
 * Citadel sim worker — runs the deterministic scheduler at 20 ticks/sec,
 * posting a RenderSnapshot after each tick.
 *
 * Phase 2: snapshot is produced by result.getSnapshot(); handles place/road/
 * demolish commands. Terrain is static (regenerated on the main thread).
 */
import { bootstrapSim } from "@citadel/sim-core/sim-bootstrap";
import type { WorkerInbound, WorkerOutbound } from "@citadel/sim-core/snapshot";

let paused = false;
let speed = 1;
let intervalId: ReturnType<typeof setInterval> | null = null;
let tick = 0;

const DEFAULT_TICKS_PER_DAY = 20;

let scheduler: ReturnType<typeof bootstrapSim>["scheduler"];
let commands: ReturnType<typeof bootstrapSim>["commands"];
let getSnapshot: ReturnType<typeof bootstrapSim>["getSnapshot"];

function startLoop(): void {
  if (intervalId !== null) clearInterval(intervalId);

  const msPerTick = 1000 / (20 * speed);

  intervalId = setInterval(() => {
    if (paused) return;
    scheduler.tick({ tick });
    tick++;

    const snap = getSnapshot(tick);
    const snapshot: WorkerOutbound = {
      type: "snapshot",
      snapshot: { ...snap, speed },
    };
    self.postMessage(snapshot);
  }, msPerTick);
}

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
      commands = result.commands;
      getSnapshot = result.getSnapshot;
      tick = 0;
      paused = false;
      speed = 1;

      const ready: WorkerOutbound = { type: "ready" };
      self.postMessage(ready);

      startLoop();
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
      if (intervalId !== null && scheduler) {
        startLoop();
      }
      break;
    }
    case "command": {
      commands.enqueue(msg.command);
      break;
    }
  }
};

void DEFAULT_TICKS_PER_DAY;
