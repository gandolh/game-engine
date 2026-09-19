// gates.mjs — the full pre-commit gate sequence, run locally.
//
// This is the sequence that used to run in a GitHub Actions workflow
// (`.github/workflows/ci.yml`, removed 2026-09-19 at the user's request). The
// workflow is gone; the CHECKS are not, because the thing that made them
// valuable was never GitHub — it was the STARTUP SMOKES. `npm run typecheck`
// and `npm run test` both stayed green through a `.glsl` dynamic-import break
// that made every Node consumer of the renderer throw at import time
// (corpus/wiki/decisions.md -> Renderer). Only actually STARTING the real
// entry points caught it, and only these smokes do that.
//
// Run it with `npm run gates`. Nothing schedules it — that is now a human's
// job, which is a real downgrade and is recorded as one in corpus.
//
// The budgets are deliberately tiny (1 day / 1 year at 20 ticks per day): the
// question each smoke answers is "does this entry point still start and exit
// 0", NOT "is the simulation good". Keep them small — this box is constrained
// and a slow gate is a skipped gate.
//
// `sim:hollow` takes MAX_YEARS, not MAX_DAYS/TICKS_PER_DAY like the other two
// sims: tools/hollow-sim reads a different env var for run length
// (tools/hollow-sim/src/env.ts), and passing MAX_DAYS to it silently no-ops
// into a full-length run.
import { spawnSync } from "node:child_process";

/** @type {{ name: string, cmd: string, env?: Record<string,string> }[]} */
const STEPS = [
  { name: "typecheck", cmd: "npm run typecheck" },
  { name: "test", cmd: "npm run test" },
  { name: "build (Farm client)", cmd: "npm run build" },
  { name: "smoke - sim (Farm)", cmd: "npm run sim", env: { MAX_DAYS: "1", TICKS_PER_DAY: "20" } },
  { name: "smoke - sim:citadel", cmd: "npm run sim:citadel", env: { MAX_DAYS: "1", TICKS_PER_DAY: "20" } },
  { name: "smoke - sim:hollow", cmd: "npm run sim:hollow", env: { MAX_YEARS: "1" } },
  { name: "smoke - preview", cmd: "npm run preview" },
  { name: "smoke - pack (library-consumer)", cmd: "npm run pack-smoke" },
];

const only = process.argv[2];
const steps = only ? STEPS.filter((s) => s.name.includes(only)) : STEPS;
if (steps.length === 0) {
  console.error(`No gate matches ${JSON.stringify(only)}. Known: ${STEPS.map((s) => s.name).join(", ")}`);
  process.exit(2);
}

const failed = [];
for (const step of steps) {
  console.log(`\n── ${step.name}\n`);
  const started = Date.now();
  const res = spawnSync(step.cmd, {
    shell: true,
    stdio: "inherit",
    env: { ...process.env, ...step.env },
  });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  // Keep going after a failure: one red gate should not hide the other seven.
  if (res.status !== 0) {
    failed.push(step.name);
    console.log(`\n✗ ${step.name} FAILED (exit ${res.status}) after ${secs}s`);
  } else {
    console.log(`\n✓ ${step.name} (${secs}s)`);
  }
}

console.log(`\n${"─".repeat(60)}`);
if (failed.length > 0) {
  console.log(`✗ ${failed.length} of ${steps.length} gates failed: ${failed.join(", ")}`);
  process.exit(1);
}
console.log(`✓ all ${steps.length} gates passed`);
