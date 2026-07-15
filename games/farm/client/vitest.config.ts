import { defineConfig } from "vitest/config";

// The jsdom-env tests — those that touch the DOM (canvas panels with a real <input> / window drag
// listeners) or browser APIs. Everything else runs in the faster node env.
const DOM_FILES = [
  "src/ui/canvas/home-screen.test.ts",
  "src/ui/canvas/hotbar.test.ts",
  "src/net/sim-client/client.visibility.test.ts",
  "src/main/juice.test.ts",
  "src/main/audio.test.ts",
];

export default defineConfig({
  test: {

    maxWorkers: 4,
    minWorkers: 1,
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: DOM_FILES,
        },
      },
      {
        test: {
          name: "dom",
          environment: "jsdom",
          include: DOM_FILES,
        },
      },
    ],
  },
});
