import type { Camera2D, RendererLike } from "@engine/core";
import type { RenderWindowController } from "../render/citadel-renderer";
import type { IsoProjection } from "../render/iso";

// ---------------------------------------------------------------------------
// Camera + renderer (Camera2D + engine WebGPU renderer; created async in boot.ts)
// ---------------------------------------------------------------------------
export let camera: Camera2D;
export let renderer: RendererLike;
export let windowController: RenderWindowController;
/**
 * The iso projection for the world we ended up with (brief 110). Assigned in boot.ts
 * from the terrain the sim actually reports — locally generated in solo, sent by the
 * server in MP. There is deliberately no module-level default: a projection built for
 * the wrong world size is what made MP render a 96×96 corner of a 256×256 map.
 */
export let iso: IsoProjection;
// `camera`/`renderer`/`iso` are assigned asynchronously by boot.ts (after `await
// createCitadelRenderer`), but the canvas input listeners (input.ts) are registered at
// module load. A pointer/wheel event arriving in that ~1s boot gap would deref an
// undefined `camera` (pan/zoom/updateCursor). World handlers bail until this flips true
// (set once camera exists) — see `setRendererState` below and every `if (!inputReady)
// return;` guard in input.ts.
export let inputReady = false;

/**
 * Assign the renderer-owned boot-time state exactly once, from boot.ts, right after
 * `await createCitadelRenderer(canvas, terrain)` resolves. This is the ONLY place these
 * bindings are reassigned — every other module (input.ts, render-loop.ts, settings.ts,
 * inspect.ts, build-controls.ts, minimap-wiring.ts, sim-client.ts) only reads them via
 * the live ES-module bindings exported above.
 */
export function setRendererState(created: {
  renderer: RendererLike;
  camera: Camera2D;
  iso: IsoProjection;
  windowController: RenderWindowController;
}): void {
  renderer = created.renderer;
  camera = created.camera;
  iso = created.iso;
  windowController = created.windowController;
  inputReady = true; // camera/renderer live → world input handlers may run
}
