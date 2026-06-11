// Root barrel — Node-safe + browser-safe (no DOM at module load). Deep subpaths in package.json exports.

export {
  bootstrapSim,
  leaderboard,
  type SimBootstrapOptions,
  type BootedSim,
  type FarmerSummary,
  type PathfinderLike,
} from "./sim-bootstrap";

export { shouldStopSkip, SKIP_MAX_DAYS } from "./sim-worker-skip";
