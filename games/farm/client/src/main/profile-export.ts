import type { Camera2D, DebugOverlay } from "@engine/core";

/**
 * Farm's own fields in the shared profile export (corpus brief 05). They are the fields of the old
 * `farm-valley-profile/1` export that the shared `game-engine-profile/1` schema has no place for, kept
 * under `extra.farm`: the run, the overlay's display readout, the camera and the sim server's profile.
 * The frame timers, the GPU and device info, the canvas size and the user agent moved into the schema.
 */
export interface FarmProfileDeps {
  overlay: DebugOverlay;
  camera: Camera2D;
  context: { seed: number; maxDays: number; ticksPerDay: number };
}

export function farmProfileExtra(deps: FarmProfileDeps): Record<string, unknown> {
  const { overlay, camera, context } = deps;
  const ov = overlay.exportReport();
  return {
    run: context,
    display: {
      fps: Number(ov.fps.toFixed(2)),
      frameMs: Number(ov.frameMs.toFixed(2)),
      tick: ov.tick,
      entityCount: ov.entityCount,
    },
    camera: {
      zoom: camera.zoom,
      worldUnitsX: camera.worldUnitsX,
      worldUnitsY: camera.worldUnitsY,
      centerX: Math.round(camera.centerX),
      centerY: Math.round(camera.centerY),
    },
    workerProfile: ov.worker,
  };
}
