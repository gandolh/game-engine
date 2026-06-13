

import { parentPort } from "node:worker_threads";
import { runOnce, type RunResult } from "./run-core";
import { makePathfinder } from "./pathfinder";

export interface DeterminismJob {
  seed: number;
  pass: 0 | 1;
  ticksPerDay: number;
  maxDays: number;
}

export interface DeterminismJobResult {
  seed: number;
  pass: 0 | 1;
  result: RunResult;
}

if (!parentPort) {
  throw new Error("determinism-worker must be run as a worker thread");
}

parentPort.on("message", async (job: DeterminismJob) => {
  const result = runOnce({
    seed: job.seed,
    ticksPerDay: job.ticksPerDay,
    maxDays: job.maxDays,
    pathfinder: await makePathfinder(),
  });
  const out: DeterminismJobResult = { seed: job.seed, pass: job.pass, result };
  parentPort!.postMessage(out);
});
