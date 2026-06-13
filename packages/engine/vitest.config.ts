import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {

      wgsl_reflect: "wgsl_reflect/wgsl_reflect.module.js",
    },
  },
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "legacy/**"],

    maxWorkers: 4,
    minWorkers: 1,
  },
});
