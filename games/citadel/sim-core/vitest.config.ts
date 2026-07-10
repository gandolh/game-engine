import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    /**
     * Several tests here drive REAL sims rather than pure functions: `terrain.test.ts`'s
     * solvability guarantee generates and flood-fills many whole 192×192 worlds, and
     * `defer-threats.test.ts` runs two full sims tick-for-tick to compare them. Alone,
     * the workspace finishes comfortably; inside a full `npm run test` (ten workspaces
     * in parallel on a contended box) those three have been observed to cross vitest's
     * 5s default and fail as timeouts rather than assertions — green in isolation, red
     * in the suite, with nothing wrong.
     *
     * A gate that goes red without a defect trains people to ignore red. Size the budget
     * to the work, not to the best case. Same reasoning as `tools/atlas-builder`'s config.
     */
    testTimeout: 30_000,
  },
});
