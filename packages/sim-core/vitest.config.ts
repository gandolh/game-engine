import { defineConfig } from "vitest/config";

// Pure sim/logic tests — no DOM. The expensive part of this suite is not the
// tests but the imports: 59 test files each pull in the whole game module
// graph (sim-bootstrap and friends), and with default per-file isolation each
// file re-evaluates it from scratch (~43s of aggregate import time).
//
// `isolate: false` shares the module registry between files in the same
// worker. This is safe here because sim-core's module-level state is
// write-once (personality/system registries self-register on first import);
// all mutable sim state lives in the per-test `bootstrapSim()` world. The
// in-suite determinism guards (sim-bootstrap.test.ts) would fail loudly if
// cross-file module state ever leaked into sim outputs.
export default defineConfig({
  test: {
    environment: "node",
    pool: "threads",
    isolate: false,
    // Constrained-hardware cap: bound peak workers so a run can't fan out to all
    // cores at once (memory/CPU spike). See feedback_scope_test_runs.
    maxWorkers: 4,
    minWorkers: 1,
  },
});
