// @farm/sim-core — Node-safe + browser-safe (no DOM at module load).
// Root barrel for the most common entry points; deep subpaths in package.json `exports`.

export {
  bootstrapSim,
  leaderboard,
  type SimBootstrapOptions,
  type BootedSim,
  type FarmerSummary,
  type PathfinderLike,
} from "./sim-bootstrap";

export { shouldStopSkip, SKIP_MAX_DAYS } from "./sim-worker-skip";
