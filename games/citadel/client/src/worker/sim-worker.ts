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
        // Solo (cozy) economy: buildings cost materials, with a founding wood grant so the
        // cold-open can place its first buildings. MP (the @citadel/server bootstrap) keeps
        // placement free for now. See BUILD_COST in @citadel/sim-core.
        chargeBuildCost: true,
        // Cozy-pivot Phase D: threat demotion on (the default; stated explicitly for clarity).
        cozyThreats: true,
        // Cozy pivot Phase G: solo is single-player — freeze PvP army resolution (a no-op here
        // already, since the armies list is always empty in solo). MP (@citadel/server) keeps
        // the default (true).
        enableArmy: false,
        startingStock: { wood: 40 },
        // Cozy cold-open (Phase C): pre-seed a small connected alive town core (bread chain +
        // house + storehouse + roads at map center) so solo play opens on a living town instead
        // of an empty map. MP (the @citadel/server bootstrap) keeps placement free / no seed.
        seedTown: true,
        // Cozy cold-open (Phase C): defer fire/disease/raids until the town grows past the seeded
        // core. The seed is 5 non-road buildings, so threats first become possible once the player
        // adds their 6th — the first ~5 buildings' worth of play is forgiving, threat-free.
        deferThreatsUntilBuildings: 6,
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
