/**
 * determinism-worker.ts — one sim run per message, in an isolated worker thread.
 *
 * Worker isolation is load-bearing here, not just a perf win: the sim keeps
 * module-level mutable state (agents/cnp-registry.ts's `coordinators` Map, keyed
 * by farmer id, and World.nextId which restarts at 1 each run), so two runs in
 * the SAME JS context would collide on those ids and cross-contaminate. Each
 * worker thread gets its own module graph, so every run is fully isolated and
 * the reproducibility comparison stays honest.
 *
 * The worker ships back the full RunResult; the parent reuses fingerprint() /
 * describeDivergence() verbatim, so comparison semantics are identical to the
 * old in-process sequential path.
 */
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

parentPort.on("message", (job: DeterminismJob) => {
  const result = runOnce({
    seed: job.seed,
    ticksPerDay: job.ticksPerDay,
    maxDays: job.maxDays,
    pathfinder: makePathfinder(),
  });
  const out: DeterminismJobResult = { seed: job.seed, pass: job.pass, result };
  parentPort!.postMessage(out);
});
