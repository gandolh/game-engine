import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    /**
     * These tests each run a REAL six-sheet atlas bake (`buildAtlas({ force: true })`),
     * some of them twice — disk I/O plus PNG encoding, not pure computation. Idle, the
     * whole file finishes in ~1.8s; at the tail of a full `npm run test` (the last of ten
     * workspaces, on a box already warm from ~2000 other tests) a single bake has been
     * observed to cross vitest's 5s default and fail with a timeout rather than an
     * assertion.
     *
     * A gate that goes red without a defect trains people to ignore red. Same reasoning
     * as `coral-fishing.integration.test.ts`'s raised hook timeout: size the budget to the
     * work, not to the best case.
     */
    testTimeout: 30_000,
  },
});
