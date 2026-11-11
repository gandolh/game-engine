import { houseStyle } from "./vendor/house-style/eslint.config.js";

// Scripts run by hand: they print and read the environment directly. The headless sim runners and the
// atlas and preview builders under tools/ are programs run by hand, so they count too.
const SCRIPTS = [
  "scripts",
  "engine/core/scripts",
  "engine/ui/scripts",
  "portal/scripts",
  "examples",
  "tools/*/src",
  "tools/world-preview",
];

/**
 * The house config from the vendored house-style copy, given this repo's folders. Thin on purpose: the
 * compiler is the first gate, and the house adds only what it cannot see. The rules and the reason for
 * each are in the copy. What stays a test, not a lint rule: the source guards in
 * engine/core/src/conventions.test.ts (no Math.random or wall clock in sim code, no .js import suffixes,
 * no ^ or ~ ranges), layering.test.ts and palette.test.ts.
 */
export default [
  ...houseStyle({
    root: import.meta.dirname,
    scripts: SCRIPTS,
    // The two WebSocket hosts print their startup line before any logger exists.
    console: ["games/*/server/src/index.ts"],
    // Helpers that wrap `expect`, so vitest/expect-expect counts a test that calls them.
    assertFunctionNames: [
      "expect",
      "expectTypeOf",
      "expectMatClose",
      "assertAscending",
      "assertFitsViewport",
      "assertNoWallCrossing",
      "verifyProblem",
    ],
    // One recipe per file, each a default export read through the recipe index.
    defaultExports: ["games/farm/atlas-recipes/src/**"],
    // TypeScript that no tsconfig covers (hand-run generators and the portal's card list).
    untyped: ["engine/ui/tools/**", "portal/scripts/**"],
    ignores: [
      // The Docusaurus site has its own conventions and its own build.
      "docs/**",
      // AssemblyScript, not TypeScript: its decorators don't parse, and its drift test hashes the sources.
      "engine/wasm-modules/**",
      // Vendored and generated: the generated glyph tables carry a "do not hand-edit" header.
      "engine/ui/vendor/**",
      "engine/ui/src/text/glyphs/unscii8.ts",
      "engine/ui/src/text/glyphs/unscii16.ts",
      "**/public/**",
      "**/*.d.ts",
      // Not source: the corpus, the fetched inspirations, the media.
      "corpus/**",
      "inspirations/**",
      "media/**",
      ".turbo/**",
    ],
  }),
  {
    name: "game-engine/rules",
    files: ["**/*.{ts,tsx,js,mjs,cjs}"],
    rules: {
      // The compiler owns unused locals (noUnusedLocals), and a rule that repeats it only disagrees about parameters.
      "@typescript-eslint/no-unused-vars": "off",
      // The word "todo" is this repo's name for a spec ("Todo 2026-07-16 ..."), so only the comment shape
      // `TODO:` counts. Real to-dos live in corpus/todos/.
      "no-warning-comments": ["error", { terms: ["todo:", "fixme", "xxx"], location: "start" }],
    },
  },
  {
    // Client and server code reports through console.warn and console.error. Scripts and tools print freely.
    name: "game-engine/console",
    files: ["**/*.{ts,tsx,js,mjs,cjs}"],
    ignores: [...SCRIPTS.map((dir) => `${dir}/**`), "games/*/server/src/index.ts", "engine/ui/tools/**"],
    rules: { "no-console": ["error", { allow: ["warn", "error"] }] },
  },
  {
    name: "game-engine/tools",
    files: ["engine/ui/tools/**"],
    rules: { "no-console": "off", "n/no-process-env": "off" },
  },
  {
    // A warning for now (2026-11-11): about 600 non-null assertions in source (3,000 more in tests), each one
    // an index access that noUncheckedIndexedAccess makes the compiler ask for. Removing them from a
    // deterministic sim by hand is a job of its own. `npm run lint` caps the warnings, so the number can only
    // go down; when it reaches zero this block goes and the rule is an error again.
    name: "game-engine/non-null-warns",
    files: ["**/*.{ts,tsx,mts,cts}"],
    rules: { "@typescript-eslint/no-non-null-assertion": "warn" },
  },
  {
    // A warning for now (2026-11-11): the two WebSocket hosts still read PORT and friends themselves. When
    // each host takes its settings from a config.ts, this block goes and the rule is an error again.
    name: "game-engine/process-env-warns",
    files: ["games/*/server/src/index.ts"],
    rules: { "n/no-process-env": "warn" },
  },
];
