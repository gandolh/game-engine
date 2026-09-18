/**
 * The tile → world-pixel scale (audit-60).
 *
 * ## Why this lives in the engine
 *
 * This number was a PRIVATE `const TILE = 16;` in 15 production files across 4 packages, plus 6
 * more in tests. It is load-bearing on both sides of the sim↔render boundary at once: sim-core's
 * render-systems emit sprite coordinates in `tile * TILE` space, the server's snapshot uses it, the
 * client inverts it in `screenToTile` (`Math.floor(wx / TILE)`), and the offline PNG renderer scales
 * by it.
 *
 * So the single change this constant exists to make possible — resizing the atlas frame — needed 15
 * coordinated edits. Miss one under `sim-core/render-systems/` and the sim emits sprites on a
 * different grid than the client inverts: **hover and click silently target the wrong tile**, while
 * every unit test stays green, because the tests hardcoded their own `16` too.
 *
 * `@engine/core` is the honest home: a tile-to-pixel scale is generic, and `render/rain-field.ts`
 * already needed it INSIDE the engine — so an engine-side owner removes an engine→client dependency
 * rather than creating one.
 *
 * ## What this is NOT
 *
 * **Citadel's `TILE_SIZE`** (`@citadel/sim-core`'s `world/terrain.ts`) is deliberately separate and
 * was checked before being left alone. It is Citadel's own world scale, already single-sourced with
 * exactly one definition and consumed through its package — there is no duplication to remove, and
 * folding it in here would hand Citadel's world scale to the engine for no benefit. Both being `16`
 * today is a coincidence, not a coupling. Recorded so the next sweep does not re-find it.
 */

/**
 * Width and height, in world pixels, of one tile — equivalently, the atlas frame size.
 *
 * Changing this rescales the whole Farm world. Every consumer imports it; nothing redeclares it.
 */
export const TILE = 16;
