// @farm/sim-core — the deterministic Farm Valley simulation, extracted from the
// farm-valley renderer so both the Node WS server (brief 57) and the renderer
// (type-only) can depend on it. Node-safe + browser-safe: no DOM at module load.
//
// Most consumers import the deep subpaths declared in package.json `exports`
// (e.g. "@farm/sim-core/world/regions", "@farm/sim-core/snapshot",
// "@farm/sim-core/protocol"). This root barrel re-exports the most common
// entry points (the bootstrap + its public types) for convenience.

export {
  bootstrapSim,
  leaderboard,
  type SimBootstrapOptions,
  type BootedSim,
  type FarmerSummary,
  type PathfinderLike,
} from "./sim-bootstrap";

export { shouldStopSkip, SKIP_MAX_DAYS } from "./sim-worker-skip";
