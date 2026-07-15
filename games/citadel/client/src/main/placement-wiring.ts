import { PlacementStateManager } from "../ui/placement-state";

// Placement mode (place/demolish/road/wall/upgrade/none) + the live ghost/drag state.
// A single singleton — read and driven by input.ts, build-controls.ts (mode setters) and
// render-loop.ts (ghost + drag-preview rendering).
export const placementState = new PlacementStateManager();
