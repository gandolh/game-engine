

import { Worker } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { fingerprint, describeDivergence, type RunResult } from "./run-core";
import type { DeterminismJob, DeterminismJobResult } from "./determinism-worker";

interface CheckOptions {
  seeds: number[];
  ticksPerDay: number;
  maxDays: number;
  worldSeed?: number;
}

const WORKER_URL = new URL("./determinism-worker.ts", import.meta.url);

function runJobsInPool(jobs: DeterminismJob[]): Promise<DeterminismJobResult[]> {
  const poolSize = Math.min(jobs.length, availableParallelism());
  const results: DeterminismJobResult[] = [];
  let next = 0;

  return new Promise((resolve, reject) => {
    let active = 0;
    let settled = false;

    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const spawn = () => {
      const worker = new Worker(WORKER_URL, { execArgv: ["--import", "tsx"] }); 

      const dispatch = () => {
        if (next >= jobs.length) {
          void worker.terminate();
          active--;
          if (active === 0 && !settled) {
            settled = true;
            resolve(results);
          }
          return;
        }
        worker.postMessage(jobs[next++]);
      };

      worker.on("message", (r: DeterminismJobResult) => {
        results.push(r);
        dispatch();
      });
      worker.on("error", fail);

      active++;
      dispatch();
    };

    for (let i = 0; i < poolSize; i++) spawn();
  });
}

export async function runDeterminismCheck(opts: CheckOptions): Promise<boolean> {
  const { seeds, ticksPerDay, maxDays, worldSeed } = opts;
  const ws = worldSeed !== undefined ? { worldSeed } : {};

  console.error(
    `Determinism check — ${seeds.length} seed(s), ${maxDays} days @ ${ticksPerDay} ticks/day` +
      ` (parallel, up to ${Math.min(seeds.length * 2, availableParallelism())} workers)`,
  );

  const jobs: DeterminismJob[] = [];
  for (const seed of seeds) {
    jobs.push({ seed, pass: 0, ticksPerDay, maxDays, ...ws });
    jobs.push({ seed, pass: 1, ticksPerDay, maxDays, ...ws });
  }

  const finished = await runJobsInPool(jobs);

  const bySeed = new Map<number, RunResult[]>();
  for (const r of finished) {
    let arr = bySeed.get(r.seed);
    if (!arr) {
      arr = [];
      bySeed.set(r.seed, arr);
    }
    arr[r.pass] = r.result;
  }

  let anyDiverged = false;
  for (const seed of seeds) {
    const pair = bySeed.get(seed);
    const a = pair?.[0];
    const b = pair?.[1];
    const seedHex = `0x${(seed >>> 0).toString(16)}`;
    if (a && b && fingerprint(a) === fingerprint(b)) {
      console.error(
        `  seed ${seedHex}: MATCH (${a.perDay.length} day snapshots, ${a.finalStandings.length} farmers)`,
      );
    } else {
      anyDiverged = true;
      console.error(`  seed ${seedHex}: DIVERGE`);
      if (a && b) console.error(describeDivergence(a, b));
    }
  }

  if (anyDiverged) {
    console.error("DETERMINISM CHECK FAILED — sim is not reproducible for at least one seed.");
    return false;
  }
  console.error("DETERMINISM CHECK PASSED — all seeds reproduced identically.");
  return true;
}
