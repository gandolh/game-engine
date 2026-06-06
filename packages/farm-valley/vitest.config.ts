import { defineConfig } from "vitest/config";

// Two projects in one config. Only the files that touch document/window/canvas
// run under jsdom; everything else runs under the much cheaper `node`
// environment. Defaulting to `node` removes the per-file jsdom setup cost
// (~85s of "environment" time) from the ~50 pure sim/logic test files.
//
// New pure-sim tests automatically land in the fast `node` project. A new UI
// test must be added to DOM_FILES (or it will run under node and fail on a
// missing DOM global — which is the desired signal that it needs jsdom).
const DOM_FILES = [
  "src/screens/home-screen.test.ts",
  "src/ui/event-feed-panel.test.ts",
  "src/ui/leaderboard.test.ts",
  "src/ui/observer.test.ts",
  "src/ui/playback-controls.test.ts",
  "src/ui/relationship-matrix.test.ts",
  "src/ui/right-column.test.ts",
  "src/ui/slate-billboard.test.ts",
  "src/ui/wealth-graph.test.ts",
];

export default defineConfig({
  test: {
    projects: [
      {
        // Default, fast project: pure sim/logic under node.
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: DOM_FILES,
        },
      },
      {
        // DOM project: only the files that actually need jsdom.
        test: {
          name: "dom",
          environment: "jsdom",
          include: DOM_FILES,
        },
      },
    ],
  },
});
