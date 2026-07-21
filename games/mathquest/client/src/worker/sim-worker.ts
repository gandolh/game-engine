/**
 * MateQuest sim worker — M0 scaffolding, mirroring `@hollow/client`'s
 * `src/worker/sim-worker.ts` shape (a Web-Worker solo sim, Citadel-style, no
 * server).
 *
 * Drives `bootstrapMathquestSim()` at a fixed 20 Hz base cadence and posts a
 * snapshot after each tick. `@engine/core` has no `FixedStepClock`
 * abstraction — the 20 Hz real-time cadence is this transport's OWN pacing (a
 * `setInterval`), never the sim's: `step()` itself only advances a tick
 * counter, so a tick's output depends solely on the tick count, never on
 * wall-clock time (determinism is load-bearing — root CLAUDE.md).
 */
import { bootstrapMathquestSim } from "@mathquest/sim-core/sim-bootstrap";
import type { MathquestSnapshot } from "@mathquest/sim-core/sim-bootstrap";

export interface WorkerInitMessage {
  type: "init";
  seed: number;
}

export type WorkerInbound = WorkerInitMessage;

export type WorkerOutbound =
  | { type: "ready" }
  | { type: "snapshot"; snapshot: MathquestSnapshot };

const BASE_TICK_HZ = 20;
const BASE_MS_PER_TICK = 1000 / BASE_TICK_HZ;

let intervalId: ReturnType<typeof setInterval> | null = null;
let sim: ReturnType<typeof bootstrapMathquestSim> | null = null;

function postSnapshot(): void {
  if (sim === null) return;
  const snapshot = sim.getSnapshot();
  self.postMessage({ type: "snapshot", snapshot } satisfies WorkerOutbound);
}

function startLoop(): void {
  if (intervalId !== null) clearInterval(intervalId);
  intervalId = setInterval(() => {
    if (sim === null) return;
    sim.step();
    postSnapshot();
  }, BASE_MS_PER_TICK);
}

self.onmessage = (event: MessageEvent<WorkerInbound>) => {
  const msg = event.data;
  switch (msg.type) {
    case "init": {
      sim = bootstrapMathquestSim({ seed: msg.seed });
      self.postMessage({ type: "ready" } satisfies WorkerOutbound);
      postSnapshot();
      startLoop();
      break;
    }
  }
};
