/**
 * The device-pixel-ratio ceiling shared by every backing-store-scaling site
 * in the renderer stack — WebGL2's `GlContext.resize`, the 2D `Overlay2D`,
 * the UI-quad flush in `webgl2/renderer.ts`, every game's screen↔world
 * pointer mapping, and (as of sweep-06) Hollow's 3D scene + name-tag
 * overlay.
 *
 * This used to be `webgl2/gl-context.ts`'s private `MAX_DPR = 2`, re-derived
 * as a bare `Math.min(dpr, 2)` literal in six more places and restated in
 * prose in four more — see
 * corpus/todos/2026-09-19-sweep-06-dpr-cap-duplicated-and-hollow-uncapped.md.
 * It lives in its own module (not `webgl2/gl-context.ts`) because non-WebGL2
 * callers (`overlay-2d.ts`, every game's client) need it and must not reach
 * into a backend-specific module to get it.
 *
 * This is a **backing-store / fill-rate cap**, not a camera setting — do not
 * confuse it with `DEFAULT_ZOOM` or anything in the camera/zoom path.
 * Conflating the two was a 2026-06-12 mistake (corpus brief 84).
 */

/**
 * Never scale a canvas backing store past this ratio, even on a very-high-DPI
 * display, to keep fill-rate bounded. 2 is a conservative floor for a modern
 * 3x-DPR phone; retuning the VALUE is a separate, measured call from
 * centralizing it here.
 */
export const MAX_DEVICE_PIXEL_RATIO = 2;

/**
 * `min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO)`.
 *
 * The `typeof window !== "undefined"` guard is load-bearing, not defensive
 * boilerplate: this module is exported from `@engine/core/render`'s public
 * barrel, which must stay importable from the `node` vitest env and from
 * headless tools (no DOM, no `window`) — see `node-import.test.ts`.
 */
export function effectiveDpr(): number {
  const raw = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  return Math.min(raw, MAX_DEVICE_PIXEL_RATIO);
}
