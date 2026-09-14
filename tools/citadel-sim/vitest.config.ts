import { defineConfig } from "vitest/config";

// audit-20: minimal node-env config, mirroring engine/core/vitest.config.ts's
// shape. This workspace's tests are pure-function/env-parsing unit tests only
// (see src/*.test.ts) — no test here may boot a sim (constrained hardware; see
// corpus/todos/2026-09-13-audit-20-tool-workspaces-test-scripts.md).
export default defineConfig({
  test: {
    environment: "node",
    exclude: ["**/node_modules/**"],
  },
});
