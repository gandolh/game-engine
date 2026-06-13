import { defineConfig } from "vitest/config";

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
  "src/worker/sim-client/client.visibility.test.ts",

  "src/main/juice.test.ts",
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
