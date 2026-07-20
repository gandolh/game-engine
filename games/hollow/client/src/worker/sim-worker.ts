/**
 * Hollow sim worker — chunk hollow-01 scaffolding, extended by chunk
 * hollow-09c with a click-to-inspect round trip.
 *
 * Drives `bootstrapHollowSim()` at 20 ticks/sec and posts a snapshot after
 * each tick, mirroring @citadel/client's src/worker/sim-worker.ts (the
 * Worker/postMessage pattern this file follows). `@engine/core` has no
 * `FixedStepClock` abstraction — the 20 Hz real-time cadence is this
 * transport's own pacing (a `setInterval`), same as Citadel's worker; the
 * sim-core `tick()` call itself only advances a tick counter.
 *
 * `"inspect"` (chunk hollow-09c): a READ-ONLY query of live sim state for
 * one agent id, answered from the SAME `simResult` this loop already ticks
 * — never mutates the world, never advances a tick, draws no `Rng` (see
 * `worker/inspect.ts`'s header for the sim/render determinism boundary this
 * upholds). The actual assembly lives in `worker/inspect.ts` (kept out of
 * this file so it's unit-testable without a Worker global).
 */
import { bootstrapHollowSim } from "@hollow/sim-core/sim-bootstrap";
import type { HollowSnapshot } from "@hollow/sim-core/sim-bootstrap";
import type { InspectDetail } from "../inspect-detail";
import { buildInspectDetail } from "./inspect";

export interface WorkerInitMessage {
  type: "init";
  seed: number;
  ticksPerDay: number;
}

export interface WorkerInspectMessage {
  type: "inspect";
  agentId: number;
}

export type WorkerInbound = WorkerInitMessage | WorkerInspectMessage;

export type WorkerOutbound =
  | { type: "ready" }
  | { type: "snapshot"; snapshot: HollowSnapshot }
  | { type: "inspectResult"; agentId: number; detail: InspectDetail | null };

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
    case "inspect": {
      if (simResult === null) break;
      // Read-only — `getSnapshot().tick` just reads the tick counter this
      // loop already maintains; `buildInspectDetail` itself never mutates
      // `simResult` (see worker/inspect.ts's header).
      const currentTick = simResult.getSnapshot().tick;
      const detail = buildInspectDetail(simResult, currentTick, msg.agentId);
      self.postMessage({ type: "inspectResult", agentId: msg.agentId, detail } satisfies WorkerOutbound);
      break;
    }
  }
};
