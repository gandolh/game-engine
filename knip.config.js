import preset from "./vendor/house-style/knip.json" with { type: "json" };

// knip has no `extends`, so this spreads the house preset and adds what knip can't find on its own:
// the probes, hand-run tools, demos, smoke scripts and AssemblyScript sources of this monorepo.
export default {
  ...preset,
  // `corpus/` holds evidence pages, `inspirations/` a fetch script and `examples/` a consumer app run by pack-smoke.
  ignore: [...preset.ignore, "corpus/verify/**"],
  // codegraph and agent-browser are global CLIs the owner installs; no package lists them.
  ignoreBinaries: ["codegraph", "agent-browser"],
  // Docusaurus loads these from its own config, a plugin knip does not read here.
  ignoreDependencies: [
    "@easyops-cn/docusaurus-theme-docusaurus-search-local",
    "@easyops-cn/docusaurus-search-local",
    "@docusaurus/plugin-content-docs",
    "prism-react-renderer",
    // Left in place, not proven dead: tsx is the loader node-import.test.ts spawns (hoisted); jsdom and @types/jsdom
    // sit in three sim-cores that never import them (dropping them touches the lockfile: a later cleanup);
    // @farm/client orders world-preview's build after the atlas; ws is the Farm server's, used by probe-perf by hand.
    "tsx",
    "jsdom",
    "@types/jsdom",
    "@farm/client",
    "ws",
  ],
  workspaces: {
    ".": { entry: ["inspirations/fetch.mjs", "scripts/*.mjs", "vendor/house-style/bin/*.mjs"] },
    "engine/core": { entry: ["src/node-import-check.ts"] },
    "engine/ui": { entry: ["tools/*.ts"] },
    "engine/wasm-modules": { entry: ["build/*.mjs", "src/*.ts"] },
    "examples/library-consumer": { entry: ["smoke*.mjs"] },
    "games/hollow/client": { entry: ["src/render3d-demo.ts"] },
    "tools/citadel-sim": { entry: ["src/**/*.mts"] },
    // rationalizer/index.ts is the documented public surface of the Claude rationalizer, never wired in.
    "tools/hollow-sim": { entry: ["src/rationalizer/index.ts"] },
    "tools/image-patches": { entry: ["src/harness/main.ts"] },
    "tools/run-sim": { entry: ["src/probes/*.ts"] },
    docs: { entry: ["src/pages/*.mdx", "src/components/*.tsx"] },
  },
};
