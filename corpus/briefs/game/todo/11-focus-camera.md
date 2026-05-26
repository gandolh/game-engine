# Game Task 11 — Focus Camera + Clickable Observer + Sprite Emphasis

## Context

The game world is a static 640×640 view of all 5 regions. There's no way for the player to *follow* a single farmer or zoom in on the village to watch a trade. The locked vision from the design interview is "watch BDI with tension"; the foundational UI feature is letting the player pick a farmer to focus on.

This is the cohesive "viewer upgrade" — splitting it across briefs would deadlock parallel work, so it stays as one unit.

## Goal

1. **Focus mode**: clicking a farmer's row in the observer panel sets that farmer as "focused". Camera centers on that farmer and follows them. Click another row to switch. Click the same row again (or a "Reset view" button) to unfocus and return to the full-world view.
2. **Free pan**: at any time, dragging the canvas pans the view (independent of focus mode — pan offsets are layered on top of the focus center). Scroll wheel adjusts zoom (clamp to sensible bounds, e.g. 0.5×–3×).
3. **Sprite emphasis**: the focused farmer gets a visible halo / outline (canvas-drawn ring or color tint). Other farmers render normally.

## Files in scope

- `packages/farm-valley/src/main.ts` — module-level `focusedFarmerId: number | null = null`; wire mouse listeners (canvas drag + wheel + observer row click); pass `{ focusedFarmerId, panOffset, zoom }` into `buildCanvasFrame` and the camera each tick
- `packages/farm-valley/src/ui/observer.ts` — make each farmer row a clickable element; on click, dispatch a callback (passed via constructor or new method `setOnFarmerClick(cb)`) with the farmer id; add a "Reset view" button at the top of the panel
- `packages/farm-valley/src/ui/observer.test.ts` — add at least 2 tests (click row fires callback with id; reset-view fires with `null`)
- `packages/farm-valley/src/render-systems.ts` — accept `focusedFarmerId` parameter on `buildCanvasFrame`; emit an extra "halo" sprite at the focused farmer's tile position (use existing `tile/fence-h` rotated, OR add a procedural ring via a new `iterateFocusHalo()` generator function — pick the simpler one and document)
- `packages/engine/src/render/camera.ts` — ALLOWED if minor: add `setCenter(x, y)` and/or `setZoom(z)` setters if they don't already exist. Read the file first. No other engine changes.

## Files you must NOT touch

- All other systems (`travel`, `market`, `shopkeeper`, `encounter`, `encounter-trade`, `perceive`, `deliberate`, `act`, `finish-day`, `harvest`, `inbox-dispatch`, `weather`, `crop-growth`, `ap`, `shop-slate`, `trust`, `day-clock`)
- All personality / agent files
- All `protocols/**`
- `world/**`, `world-setup.ts`, `sim-bootstrap.ts`, `components.ts`
- `ui/dom.ts`, `ui/config-panel.ts`
- `screens/**`
- Other engine source (only `render/camera.ts` is in-scope, and only if needed)

## Coordination with concurrent briefs

Other briefs running in parallel will also touch `render-systems.ts` and possibly `main.ts`:
- **Brief 13 (walking-animation)** — writes to `entity.sprite.frame` *from elsewhere* (a new animator system or component update), so it should not conflict with your changes inside the sprite loop. If you both edit the entity-sprite block in `render-systems.ts`, prefer extracting a helper function so the merge is mechanical.
- **Brief 14 (meet-indicator)** — adds a *separate* `iterateMeetIndicators` generator alongside your `iterateFocusHalo`. No conflict expected.
- **Brief 15 (slate-billboard) + Brief 12 (live-leaderboard)** — both add NEW DOM panels (not via the canvas). They touch `main.ts` only for wire-up. Put your camera/mouse listener wire-up in a clearly labeled section near the existing `setupRuntime` so they can insert their wire-up adjacent without overlap.

## Acceptance criteria

- `npm run typecheck -w farm-valley` passes
- `npm run test -w farm-valley` passes (no regressions; new observer test cases added)
- `npm run dev`: clicking a farmer row in the observer recenters the camera on them and renders a halo around their sprite. Clicking another row switches. Reset button clears focus. Dragging the canvas pans the view. Scroll-wheel zooms.
- No `.js` import suffixes; no new runtime deps

## Workflow

You're the sonnet executor. Read this brief, then the listed files, then implement. Run typecheck + tests before reporting done. Report files changed, test counts, and anything surprising. Do not commit — orchestrator handles that.
