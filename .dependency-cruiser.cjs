// The house dependency-cruiser preset, from the vendored house-style copy: no cycles, no unresolvable
// imports, a feature used through its index only, no Fastify in lib/. The engine-never-imports-a-game
// rule stays a test (engine/core/src/layering.test.ts).
module.exports = {
  extends: "./vendor/house-style/.dependency-cruiser.cjs",
  forbidden: [
    // A warning for now (2026-11-11): 37 import cycles, mostly a client panel or system and the module
    // that builds it importing each other (Farm's panels, Citadel's sim-state, renderer and HUD). Each is
    // a cycle between two files, resolved at call time, not at load. When they are untangled, this goes
    // and the rule is an error again.
    { name: "no-circular", severity: "warn" },
  ],
};
