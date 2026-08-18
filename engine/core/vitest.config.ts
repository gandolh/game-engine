import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {

    },
  },
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "legacy/**"],

    maxWorkers: 4,
    minWorkers: 1,
  },
});
