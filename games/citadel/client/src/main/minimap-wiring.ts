import { CitadelMinimap } from "../ui/minimap";
import { iso } from "./renderer-state";
import { camera } from "./renderer-state";
import { terrain } from "./terrain";
import { clearFollow } from "./build-controls";

export let minimap: CitadelMinimap | null = null;

/**
 * Minimap (top-right): now drawn IN-CANVAS via @engine/ui (raw UISurface quads) in the render
 * loop; clicking it recentres the camera on that tile and releases any follow-cam lock. Camera
 * centre is in iso world-px, so map the clicked tile through the iso projection. No canvas —
 * the host forwards pointer presses to minimap.trySeek (input.ts). Called once from boot.ts.
 */
export function initMinimap(): void {
  minimap = new CitadelMinimap(iso, terrain, (tx, ty) => {
    clearFollow(); // release the follow-cam + hide the in-canvas villager panel
    const c = iso.tileToIso(tx, ty);
    camera.setCenter(c.x, c.y);
  });
}
