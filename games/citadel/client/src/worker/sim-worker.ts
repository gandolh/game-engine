/**
 * Citadel sim worker — runs the deterministic scheduler at 20 ticks/sec,
 * posting a RenderSnapshot after each tick.
 *
 * Phase 2: snapshot is produced by result.getSnapshot(); handles place/road/
 * demolish commands. Terrain is static (regenerated on the main thread).
 * Phase 5: handles request-save (returns CitadelSave blob) and load-save
 * (replays a CitadelSave to reconstruct identical sim state).
 */
import { bootstrapSim, loadFromSave } from "@citadel/sim-core/sim-bootstrap";
import type { WorkerInbound, WorkerOutbound, CitadelSave } from "@citadel/sim-core/snapshot";

let paused = false;
let speed = 1;
let intervalId: ReturnType<typeof setInterval> | null = null;
let tick = 0;
// Set when a command arrives; lets the paused loop know there is work to apply
// (so we only re-bake/re-snapshot when something actually changed).
let commandsPending = false;

let simResult: ReturnType<typeof bootstrapSim> | null = null;

function startLoop(): void {
  if (simResult === null) return;
  if (intervalId !== null) clearInterval(intervalId);

  const msPerTick = 1000 / (20 * speed);
  const result = simResult;

  intervalId = setInterval(() => {
    if (paused) {
      // Plan-while-paused: apply queued placement/demolish commands without
      // advancing the sim or the day clock, then re-emit a snapshot so the new
      // layout shows immediately. No tick increment, no sim systems run.
      if (commandsPending) {
        commandsPending = false;
        result.applyCommands({ tick });
        const snap = result.getSnapshot(tick);
        self.postMessage({ type: "snapshot", snapshot: { ...snap, speed } } satisfies WorkerOutbound);
      }
      return;
    }
    result.scheduler.tick({ tick });
    tick++;

    const snap = result.getSnapshot(tick);
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
      simResult = bootstrapSim({
        seed: msg.seed,
        ticksPerDay: msg.ticksPerDay,
        maxDays: 365,
      });
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
      if (intervalId !== null && simResult !== null) {
        startLoop();
      }
      break;
    }
    case "command": {
      simResult?.commands.enqueue(msg.command);
      commandsPending = true;
      break;
    }

    // Phase 5: Save — serialize and send the command log back to the main thread.
    case "request-save": {
      if (simResult === null) break;
      const save = simResult.serializeSave(tick);
      const out: WorkerOutbound = { type: "save-data", save };
      self.postMessage(out);
      break;
    }

    // Phase 5: Load — replay a CitadelSave to reconstruct identical sim state.
    // Pauses before replay, restores speed after.
    case "load-save": {
      if (intervalId !== null) clearInterval(intervalId);
      const loaded = loadFromSave(msg.save);
      simResult = loaded;
      // Resume from the tick that was the save point.
      tick = msg.save.currentTick;
      paused = false;

      const ready: WorkerOutbound = { type: "ready" };
      self.postMessage(ready);
      startLoop();
      break;
    }
  }
};
