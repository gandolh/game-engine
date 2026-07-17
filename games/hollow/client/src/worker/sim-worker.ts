/**
 * Hollow sim worker — chunk hollow-01 scaffolding.
 *
 * Drives `bootstrapHollowSim()` at 20 ticks/sec and posts a snapshot after
 * each tick, mirroring @citadel/client's src/worker/sim-worker.ts (the
 * Worker/postMessage pattern this file follows). `@engine/core` has no
 * `FixedStepClock` abstraction — the 20 Hz real-time cadence is this
 * transport's own pacing (a `setInterval`), same as Citadel's worker; the
 * sim-core `tick()` call itself only advances a tick counter.
 *
 * No gameplay yet: the scheduler has an EMPTY system list (see
 * `@hollow/sim-core/sim-bootstrap`), so the snapshot is just `{ tick }`.
 */
import { bootstrapHollowSim } from "@hollow/sim-core/sim-bootstrap";
import type { HollowSnapshot } from "@hollow/sim-core/sim-bootstrap";

export interface WorkerInitMessage {
  type: "init";
  seed: number;
  ticksPerDay: number;
}

export type WorkerInbound = WorkerInitMessage;

export type WorkerOutbound =
  | { type: "ready" }
  | { type: "snapshot"; snapshot: HollowSnapshot };

const TICK_HZ = 20;

let intervalId: ReturnType<typeof setInterval> | null = null;
let simResult: ReturnType<typeof bootstrapHollowSim> | null = null;

function postSnapshot(): void {
  if (simResult === null) return;
  const snapshot = simResult.getSnapshot();
  self.postMessage({ type: "snapshot", snapshot } satisfies WorkerOutbound);
}

function startLoop(): void {
  if (simResult === null) return;
  if (intervalId !== null) clearInterval(intervalId);
  const result = simResult;
  const msPerTick = 1000 / TICK_HZ;
  intervalId = setInterval(() => {
    result.tick();
    postSnapshot();
  }, msPerTick);
}

self.onmessage = (event: MessageEvent<WorkerInbound>) => {
  const msg = event.data;
  switch (msg.type) {
    case "init": {
      simResult = bootstrapHollowSim({ seed: msg.seed, ticksPerDay: msg.ticksPerDay });
      const ready: WorkerOutbound = { type: "ready" };
      self.postMessage(ready);
      startLoop();
      break;
    }
  }
};
