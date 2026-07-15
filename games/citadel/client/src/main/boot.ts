import { findCoreBox, CORE_BOX_W, CORE_BOX_H } from "@citadel/sim-core";
import { MAX_ZOOM } from "@engine/core";
import { loadFontAtlas, loadIconAtlas } from "@engine/ui";
import { createCitadelRenderer, clampZoom } from "../render/citadel-renderer";
import type { GameMode } from "../ui/new-game-modal";
import { SEED, TICKS_PER_DAY } from "./constants";
import { canvas } from "./dom";
import { terrain } from "./terrain";
import { setRendererState, camera, iso, renderer, windowController } from "./renderer-state";
import { initResourceHud, initSiegeHud } from "./hud-panels";
import { initInspectPanel } from "./inspect";
import { initVillagerPanel, initBuildBar, updateModeLabel } from "./build-controls";
import { initSettingsDispatcher } from "./settings";
import { initMinimap } from "./minimap-wiring";
import { initNewGameModal, newGameMirror } from "./new-game";
import { useServer, client, markOpeningFramed, currentBuildings, currentVillagers, latestSnapshot } from "./sim-client";
import { loop, windowBakes } from "./render-loop";
import { tileToScreenCss } from "./screen-mapping";
// Side-effect imports: these modules register DOM event listeners / construct singletons at
// module load, in the same relative order the original single-file main.ts did (see the
// import order in main/index.ts, which is what actually drives evaluation order).

// Dev-only test hook: lets an automated harness (Playwright) drive the same
// command channel the UI uses, for deterministic end-to-end validation. Guarded
// by import.meta.env.DEV so it never ships in a production build. Installed at
// module top level (not inside boot()) so it exists immediately on page load,
// same as the original — every closure below reads the live cross-module bindings
// at CALL time, long after boot() has resolved.
if (import.meta.env.DEV) {
  (window as unknown as { __citadel?: unknown }).__citadel = {
    send: (cmd: unknown) => client.sendCommand(cmd as never),
    terrain: () => terrain,
    buildings: () => currentBuildings,
    villagers: () => currentVillagers,
    // Latest full RenderSnapshot — lets a harness assert sim state directly
    // (day/population/happiness/tier/allHomesCovered) instead of scraping the
    // in-canvas HUD (which no longer has DOM to read since the 2026-06-30 UI
    // migration). Notably exposes `allHomesCovered` so the Phase-F banner edge
    // is assertable, not inferred. `null` until the first snapshot arrives.
    snapshot: () => latestSnapshot,
    // Project a tile centre to a CSS-px point (relative to the viewport) so a
    // test harness can drive REAL UI gestures — hovering the placement ghost,
    // clicking a specific tile — not just the command channel. Mirrors the
    // renderer's world→screen transform.
    tileToScreenCss: (tx: number, ty: number) => tileToScreenCss(tx + 0.5, ty + 0.5),
    // Brief 110: the windowed static-layer bake had never executed in production
    // (`shouldWindow` was always false on the old 96×96 world), so its liveness is
    // not something a unit test can assert. Expose enough for a harness to watch the
    // IncrementalQueue actually drain as the camera pans, and to catch a window that
    // stops tracking the camera.
    windowState: () => ({
      windowed: windowController.windowed,
      pending: windowController.pending,
      baked: windowController.bakedWindow,
      bakes: windowBakes,
    }),
    camera: () => ({ centerX: camera.centerX, centerY: camera.centerY, zoom: camera.zoom }),
    panTo: (tx: number, ty: number) => {
      const c = iso.tileCenterToIso(tx, ty);
      camera.setCenter(c.x, c.y);
    },
  };
}

/**
 * Start the sim under the chosen ruleset (brief 103). Called either by the in-canvas picker or,
 * on the `?mp` / `?challenge` / `?cozy` fast-paths, straight from boot(). Runs exactly once.
 *
 * Hands the sim the dims of the terrain we just baked, so solo cannot desync from its own worker
 * (brief 110). The MP client ignores both the dims and the mode — there the server owns the world
 * AND the ruleset.
 */
function startGame(mode: GameMode): void {
  newGameMirror?.update(null); // the picker never reopens — drop its mirror subtree from the Tab order

  // Challenge has no `seedTown`, so no buildings exist at day 0 and the "frame on the seeded
  // centroid" opener (sim-client.ts's onSnapshot, which waits for buildings to appear in a
  // snapshot) would instead fire on the FIRST BUILDING THE PLAYER PLACES — yanking the camera
  // mid-play. Frame the founding view on the guaranteed-buildable core box up front and mark the
  // opener spent.
  if (!useServer && mode === "challenge") {
    const core = findCoreBox(terrain.cells, terrain.width, terrain.height);
    const cx = (core?.x ?? Math.floor(terrain.width / 2)) + CORE_BOX_W / 2;
    const cy = (core?.y ?? Math.floor(terrain.height / 2)) + CORE_BOX_H / 2;
    const c = iso.tileToIso(cx, cy);
    camera.setCenter(c.x, c.y);
    camera.setZoom(clampZoom(MAX_ZOOM));
    markOpeningFramed();
  }

  client.init(SEED, TICKS_PER_DAY, terrain.width, terrain.height, mode);
  updateModeLabel();
}

/**
 * Boot: create the WebGPU renderer (bakes terrain), then start sim + loop.
 * Citadel is WebGPU-only at runtime — if WebGPU is unavailable this throws and
 * the surface stays blank (matches the FV pattern; no Canvas2D fallback).
 */
async function boot(): Promise<void> {
  const created = await createCitadelRenderer(canvas, terrain);
  setRendererState(created);

  // engine-ui chunk 7: register the bitmap font atlas (once), build the in-canvas HUD,
  // and wire its render/input/a11y plumbing.
  //  - addAtlas(loadFontAtlas()) makes drawText's glyph quads resolvable by the renderer.
  //  - addAtlas(loadIconAtlas()) does the same for icon() / button({icon}) quads (the build
  //    bar's icon grid + the resource HUD's goods-strip icons) — without this the icon draw
  //    calls reference an atlas id the renderer never loaded and paint nothing.
  renderer.addAtlas(await loadFontAtlas());
  renderer.addAtlas(await loadIconAtlas());
  initResourceHud();

  // Chunk 1A (brief 106): the siege/hazard HUD as a SECOND top-row UI root.
  initSiegeHud();

  // Inspect chunk 2: the floating inspect panel as a THIRD UI root.
  initInspectPanel();

  // Villager-job chunk 3: the floating follow-a-villager panel as a FOURTH UI root.
  initVillagerPanel();

  // Build bar (DOM-overlay removal): a FIFTH UI root — the placement toolbar.
  initBuildBar();

  // Settings modal (DOM-overlay removal): wire its dispatcher + a11y mirror.
  initSettingsDispatcher();

  // Minimap (top-right): now drawn IN-CANVAS via @engine/ui.
  initMinimap();

  // Brief 103: the ruleset is chosen at founding, in-canvas, BEFORE the sim is inited — the
  // picker is a SEVENTH UI root with its own dispatcher + a11y mirror. It is not dismissable, so
  // no Escape/close wiring.
  //
  // Two paths skip it and start immediately:
  //   - MP (`?mp`): the server owns the ruleset, so there is nothing for a solo picker to choose.
  //   - the URL fast-path (`?challenge` / `?cozy`): the dev/playtest shortcut, which is why it
  //     stays — a scripted browser run must be able to enter a mode without a click.
  const params = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();
  const urlMode: GameMode | null = params.has("challenge") ? "challenge" : params.has("cozy") ? "cozy" : null;
  const preChosen: GameMode | null = useServer ? "cozy" : urlMode;
  initNewGameModal(preChosen, startGame);

  // The loop runs either way: while the picker is up it renders the (unpopulated) world + the
  // dialog, and the HUD reads its zero-state — no snapshot arrives until `client.init()` is called.
  if (preChosen !== null) startGame(preChosen);
  requestAnimationFrame(loop);
}

// art-06: DEV-only all-assets SHOWCASE mode. `?showcase` short-circuits the full
// game boot (no sim, no HUD) and runs the asset-critique harness instead — every
// sprite spaced on the iso grid, with isometry / all-burning / day-phase toggles
// exposed on `window.__citadelShowcase` for the capture script. Never ships in
// production (import.meta.env.DEV) and never reached in a normal client load.
const SHOWCASE_MODE = import.meta.env.DEV && new URLSearchParams(location.search).has("showcase");

if (SHOWCASE_MODE) {
  void (async () => {
    const { runShowcase } = await import("../render/showcase");
    const handle = await runShowcase(canvas, terrain);
    (window as unknown as { __citadelShowcase?: unknown }).__citadelShowcase = handle;
    console.info("[citadel] showcase mode — toggles on window.__citadelShowcase.toggles");
  })().catch((err) => console.error("[citadel] showcase boot failed", err));
} else {
  void boot().catch((err) => {
    console.error("[citadel] boot failed", err);
  });
}
