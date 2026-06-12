import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // wgsl_reflect ships a CJS file as its "main" despite declaring type:module.
      // Redirect to the correct ESM entry so vitest's module runner can load it.
      wgsl_reflect: "wgsl_reflect/wgsl_reflect.module.js",
    },
  },
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "legacy/**"],
    // Constrained-hardware cap (see feedback_scope_test_runs).
    maxWorkers: 4,
    minWorkers: 1,
  },
});
