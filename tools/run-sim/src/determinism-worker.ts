import { parentPort } from "node:worker_threads";
import { runOnce, type RunResult } from "./run-core";
import { makePathfinder } from "./pathfinder";

export interface DeterminismJob {
  seed: number;
  pass: 0 | 1;
  ticksPerDay: number;
  maxDays: number;
  worldSeed?: number;
}

export interface DeterminismJobResult {
  seed: number;
  pass: 0 | 1;
  result: RunResult;
}

if (!parentPort) {
  throw new Error("determinism-worker must be run as a worker thread");
}

async function handleJob(job: DeterminismJob): Promise<void> {
  const result = runOnce({
    seed: job.seed,
    ticksPerDay: job.ticksPerDay,
    maxDays: job.maxDays,
    pathfinder: await makePathfinder(),
    ...(job.worldSeed !== undefined ? { worldSeed: job.worldSeed } : {}),
  });
  const out: DeterminismJobResult = { seed: job.seed, pass: job.pass, result };
  parentPort!.postMessage(out);
}

// The listener must return void. `void` keeps what an async listener always did with a failure: it
// is an unhandled rejection, which ends the worker and reaches the parent.
parentPort.on("message", (job: DeterminismJob) => {
  void handleJob(job);
});
