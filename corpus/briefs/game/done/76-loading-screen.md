# Brief 76 — Loading screen (cover the boot flash before first full frame)

**Status:** Todo · **Area:** `packages/farm-valley` (boot / UI) · **Drafted:** 2026-06-11

When a run starts there is a visible gap between the canvas appearing and the world+UI being ready: the renderer paints its ocean backdrop (`clearColor = EDG.blue`) and the baked water pattern *before* the static layer is baked, the panels are built, and the first sim snapshot arrives. The user sees a blank/water-only screen with no UI for a beat, which reads as a glitch rather than a load. Add an explicit loading screen overlay that stays up until the first full render frame is ready, then fades out — **render/UI-only; no sim or determinism impact.**

## Read first

- [packages/farm-valley/src/main.ts](../../../../packages/farm-valley/src/main.ts) — `boot()` → `HomeScreen` → `startGame()`; the async gap lives in `startGame`: `await runtimePromise` (atlas + wasm load), `buildPanels`, `bakeStaticLayer` (async — waits on `client.onStaticLayer`), then `client.init` and the first `requestAnimationFrame(renderFrame)`.
- [packages/farm-valley/src/screens/home-screen.ts](../../../../packages/farm-valley/src/screens/home-screen.ts) — the existing full-screen overlay pattern: absolute `inset:0`, `zIndex`, EDG-palette gradient background, `transition: opacity 200ms` fade. **Reuse this pattern** rather than inventing a new one.
- [packages/farm-valley/src/main/static-layer.ts](../../../../packages/farm-valley/src/main/static-layer.ts) — `bakeStaticLayer` subscribes to `client.onStaticLayer`; the static world isn't drawable until this fires. A natural "world ready" signal.
- [packages/farm-valley/src/main/render-loop.ts](../../../../packages/farm-valley/src/main/render-loop.ts) — `createRenderLoop`; the loop only has real content once the first snapshot has been received and interpolation has two frames.
- Root [CLAUDE.md](../../../../CLAUDE.md) — **EDG32 palette enforced**: every color (including any spinner/progress pixels and the overlay background) must be an `EDG.*` constant, or the palette guard test fails.

## Current state

- `index.html` paints `#app` background `#0c0d12` and the canvas, so the very first paint is a dark page (acceptable). The flash is *after* Start: the renderer clears to `EDG.blue` ocean and bakes the water pattern while the rest of the scene/UI is still spinning up.
- `HomeScreen` already covers page-load → Start. There is **no** overlay covering Start → first-full-frame; that is the gap this brief fills.
- The boot is genuinely async (atlas sheets + wasm noise + static-layer bake + first snapshot round-trip through the worker), so the gap is real wall-clock time, not a one-frame hiccup — worse on a cold cache or the slower target hardware.

## Tasks

- [ ] **1. Loading overlay component** — add a `LoadingScreen` (sibling of `HomeScreen`, e.g. `src/screens/loading-screen.ts`) reusing the `HomeScreen` overlay style constants: absolute `inset:0`, high `zIndex` (above canvas + panels), EDG-palette background, a title/label ("Loading…" or the run seed), and an optional minimal indicator (a pulsing dot row or simple progress text — EDG colors only, no external assets). Expose `show()`, optional `setProgress(label)`, and `hide()` (fade via the existing `opacity 200ms` transition, then remove from DOM).
- [ ] **2. Wire into the boot flow** — in `startGame` ([main.ts](../../../../packages/farm-valley/src/main.ts)), show the loading screen immediately when Start is clicked (before `await runtimePromise`), so the ocean-only canvas is never exposed bare. Keep it up across the async steps.
- [ ] **3. Define "ready" and dismiss** — hide the loading screen only once the world is actually drawable: after the static layer has baked **and** the first sim snapshot has been rendered (first real `renderFrame` with ≥2 snapshots for interpolation). Hook the dismissal off those existing signals (`client.onStaticLayer` + first snapshot in the render loop) rather than a fixed timer. Optionally drive `setProgress` from the same milestones (e.g. "Loading assets…" → "Building world…" → "Starting sim…").
- [ ] **4. Error path** — if boot throws (`showFatal` in the `catch`), ensure the loading screen is removed/replaced so it doesn't sit on top of the fatal message.
- [ ] **5. Verify** — `npm run dev`: from Start click there is no moment of water-only canvas; the loading overlay covers the gap and fades to the ready world. Palette guard green (`npm run test`), `npm run typecheck` clean, and `npm run sim` byte-identical to baseline (this change touches only main-thread UI/boot — the worker/sim must be untouched).

## Acceptance

- Clicking Start never reveals a bare ocean/blank canvas — the loading overlay is up before the first canvas paint of the run and fades out only when the world + first frame are ready.
- The overlay dismisses off real readiness signals (static layer baked + first snapshot rendered), not a hardcoded delay.
- On a boot error the loading overlay is gone and the fatal message is visible.
- `npm run sim` is byte-identical to the pre-change run; palette guard and typecheck pass.

## Risks / notes

- **Determinism / sim:** this is strictly main-thread UI. Do not touch `sim-bootstrap.ts`, the worker, or anything seeded — the loading screen reacts to existing client callbacks only.
- **Palette:** any spinner/dot/progress color and the overlay background must be `EDG.*` constants (mirror the `HomeScreen` style constants); off-palette literals fail the guard test.
- **Don't double-cover:** `HomeScreen` already owns page-load → Start. Scope this overlay to Start → first-full-frame so the two don't fight over `zIndex` or leave a flash between hand-offs (hide `HomeScreen` and show `LoadingScreen` in the same Start handler tick).
- **Shared-run / spectator (brief 72):** for a spectator attaching to an in-progress run the "first snapshot" may be a late-join replay frame — confirm the dismissal signal still fires on that path so a spectator isn't stuck on the loading screen.
