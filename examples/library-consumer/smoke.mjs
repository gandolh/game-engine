// Orchestrator: runs every smoke module in this fixture. Each module throws (via node:assert)
// on failure, so a non-zero exit here means something regressed in the packed tarballs.

console.log("== library-consumer smoke ==");

await import("./smoke-isolation.mjs");
await import("./smoke-core.mjs");
await import("./smoke-wasm.mjs");
await import("./smoke-ui.mjs");

console.log("== all smokes passed ==");
