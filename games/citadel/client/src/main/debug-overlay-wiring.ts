/**
 * Citadel debug overlay wiring (todo 2026-07-15-citadel-fps-debug-overlay.md).
 *
 * Farm Valley already shows a corner fps/ms/tick/alpha/ents readout via the game-agnostic
 * `DebugOverlay` class hoisted into `@engine/core` (engine/core/src/debug/overlay.ts — it
 * never imports a game, so it's safe to reuse here). This module REUSES that same class for
 * Citadel instead of re-implementing it: create one instance at boot, and feed it Citadel's own
 * per-frame numbers from render-loop.ts's loop() every frame (mirrors Farm's
 * `main/panels.ts` + `main/render-loop.ts` split — build once, update per frame).
 *
 * Dev-only, gated on `import.meta.env.DEV`. Farm's own overlay actually has no such gate (it's
 * unconditionally mounted in `buildPanels`) — but Citadel already has an established "dev-only
 * surface" idiom (boot.ts's `__citadel` test hook, the `?showcase` harness), and a perf/debug
 * corner readout fits that idiom better than shipping it to every player in production. Using
 * the same toggle Citadel already has avoids introducing a second, inconsistent mechanism.
 *
 * Corner: Farm's top-left default is already taken in Citadel by the in-canvas resource HUD +
 * siege/hazard HUD (both anchored at (8,8) too — see hud-panels.ts / render-loop.ts), so this
 * pins the overlay to the bottom-right instead, the one corner none of Citadel's HUD, minimap,
 * build bar, or villager panel currently occupies. `OverlayCorner` is the small additive engine
 * API this needed (engine/core/src/debug/overlay.ts) — generic, defaults to "top-left" so Farm's
 * exact pixel position is unchanged.
 */
import { DebugOverlay } from "@engine/core";

/**
 * The live overlay instance, or `undefined` outside dev builds (or before `initDebugOverlay`
 * runs). render-loop.ts reads this every frame via `debugOverlay?.update(...)`, so referencing
 * it before init / in a production build is a safe no-op, not a crash.
 */
export let debugOverlay: DebugOverlay | undefined;

/**
 * Create + mount the overlay under `parent` (boot.ts passes `document.body`, matching Farm's
 * `main/panels.ts`). No-op outside dev builds (`npm run citadel` / `vite dev` — see
 * vite-env.d.ts). Safe to call unconditionally from boot.ts; the DEV check lives in here so
 * every caller gets the same gate for free.
 */
export function initDebugOverlay(parent: HTMLElement): void {
  if (!import.meta.env.DEV) return;
  debugOverlay = new DebugOverlay(parent, { corner: "bottom-right" });
}
