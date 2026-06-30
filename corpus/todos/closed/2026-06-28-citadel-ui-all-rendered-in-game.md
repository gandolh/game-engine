---
title: "@engine/ui — a cross-game, backend-agnostic in-canvas UI framework (all GUI rendered in-game)"
created: 2026-06-28
status: done
tags: [citadel, farm, engine, ui, render, architecture, framework]
---

# `@engine/ui` — render ALL GUI in-game, as a reusable cross-game framework

> **Update 2026-06-30 — ✅ DONE. ALL GUI now renders in-canvas; no DOM UI overlays remain over the Citadel world.** The DOM-overlay removal completed (5/5 surfaces, branch `citadel-dom-overlay-removal`). Earlier waves: framework SHIPPED + all 6 consumer panels ([brief 17](../briefs/engine/done/17-engine-ui-framework.md)); **toasts** (in-canvas column, `opacity`-fade + `#toast-live` aria-live mirror); **build bar** ([build-bar.ts](../../games/citadel/client/src/ui/build-bar.ts), grouped TEXT buttons + dispatcher + a11y mirror; emoji dropped → [authored-typography-and-icons](2026-06-30-engine-ui-authored-typography-and-icons.md) todo). **Final wave (this update) — the last 3 DOM surfaces:**
> 1. **Occupancy badges** → in-canvas world-anchored `@engine/ui` chips ([occupancy-badges.ts](../../games/citadel/client/src/render/occupancy-badges.ts)): pooled panel+label headcount chips, positioned per-building via a new canvas-relative `tileToCanvasCss`, drawn in the render loop. Removed `#occupancy-badges` DOM + CSS.
> 2. **`@engine/ui` widget extension** — added reusable **`slider`** + **`checkbox`/`toggle`** node kinds (the framework only had panel/box/label/button): ctors + flex sizing + EDG32 theme tokens + render walk; slider drag via the dispatcher's existing `onDrag` hook + track-click + arrow-key nudge; a11y-mirror branches (`<input type=range>` w/ `aria-valuenow`; `<input type=checkbox>` w/ `aria-checked`). The node owns its value (clamp+snap); `onChange` fires on every input.
> 3. **Minimap** → in-canvas raw-quad draw ([minimap.ts](../../games/citadel/client/src/ui/minimap.ts)): no `@engine/ui` node kind (closed `renderTree` switch has no escape hatch) — instead draws terrain (precomputed face-local quads) + entity specks + camera-viewport rect via `UISurface.rect` directly in the host loop; `trySeek(x,y,ox,oy)` for click-to-seek. Removed the `#minimap` Canvas2D + CSS. (Tradeoff: terrain tiles render as small axis-aligned rects, not diamonds — UISurface can't fill diamonds; imperceptible at 168px.)
> 4. **Settings modal** → in-canvas `@engine/ui` ([settings-modal.ts](../../games/citadel/client/src/ui/settings-modal.ts)): tabbed (Display zoom-slider / Atmosphere toggle-checkboxes / Simulation speed-buttons) via a button-row + panel-visibility pattern; own dispatcher + `#ui-a11y-settings` mirror; the host makes it **fully modal** (all canvas pointer/wheel swallowed while open). The live **search field was dropped** (no text-input widget in `@engine/ui`); `matchesSearch`/`nextTabIndex` helpers kept.
>
> **Verified in real WebGPU** (playtest-citadel + a focused modal probe): minimap renders w/ viewport rect; occupancy "N" chips render over buildings; the modal opens (tabs + working zoom slider thumb), is fully modal (a click behind it with a build tool armed placed nothing), exposes Close/Display/Atmosphere/Simulation as real a11y `<button>`s, and clears its mirror on Escape. Gates: `@engine/ui` 133 tests, `@citadel/client` 369 tests, EDG32 palette guard 6/6, all typecheck-clean. Determinism untouched (render/input only). **A review pass (3 scoped finders) caught + fixed 5 real issues: a module-init crash (the modal ctor read `camera.zoom` before async boot — guarded), modal not-fully-modal (presses/wheel/keys leaked behind it — full-canvas intercept), slider thumb overflow at min/max, mirror slider bypassing snap/clamp, and a checkbox a11y text-node growth bug.**

> **⭐ GRILLED 2026-06-28 (round 7) — four decisions locked. This is no longer a small
> Citadel-client task; it is a first-class engine subsystem.**
> 1. **Sequencing:** build the in-game UI layer **FIRST**, then the six Citadel UI panels
>    native to it. "All GUI in-game" is a **hard aesthetic/product requirement** (the UI
>    must live in the pixel-art world), so DOM-first would be throwaway *design*, not just
>    code. The six 2026-06-28 UI todos are **reclassified as consumers** of this framework.
> 2. **Accessibility:** a **hidden DOM a11y mirror** is a *required deliverable* — visuals
>    render 100% in-canvas; an invisible screen-reader-only DOM tree (real `<button>`s +
>    ARIA + focus) mirrors the UI and drives the same commands. Canvas = picture, DOM =
>    interface for AT + keyboard.
> 3. **Scope:** a **full, reusable UI toolkit** (layout, scrolling, text wrap/shaping,
>    theming, animation, hit-testing) — justified because the UI surface is large,
>    ongoing, and **shared across Citadel + Farm Valley + future games** (investment, not
>    six-panel over-engineering).
> 4. **Architecture:** lives in a **new `@engine/ui` package** — **game-agnostic**
>    (no building types / no "bread"; primitives only) and **render-backend-agnostic**
>    (renders through the engine renderer abstraction → works on **WebGPU AND the
>    Canvas2D fallback**, so Farm Valley + the headless test renderer can use it too).
>    Game-specific panels live in each game's **client**, built *from* `@engine/ui`.
>    Honors the locked rule: **`@engine/core`/`@engine/ui` never import a game.**

The whole UI should be **rendered in-game** — drawn inside the WebGPU canvas as part of
the scene — rather than as HTML/DOM overlays floating on top of it.

## Current state — the UI is DOM + a 2D-canvas minimap, NOT in-engine
Per [citadel-overview.md](../wiki/citadel-overview.md), the client is **DOM overlays over
a single WebGPU world canvas**:
- `#build-bar`, `#hud` row, follow-HUD — plain DOM
  ([index.html](../../games/citadel/client/index.html)).
- Toasts ([ui/toast.ts](../../games/citadel/client/src/ui/toast.ts)), settings modal
  ([ui/settings-modal.ts](../../games/citadel/client/src/ui/settings-modal.ts)),
  occupancy badges ([render/occupancy-badges.ts](../../games/citadel/client/src/render/occupancy-badges.ts))
  — pooled **DOM** overlays positioned via `tileToScreenCss`.
- Minimap ([ui/minimap.ts](../../games/citadel/client/src/ui/minimap.ts)) — a separate
  **Canvas2D** surface.

So "render all GUI in-game" is an **architectural shift**: build the `@engine/ui`
framework (textured quads + a bitmap font in the EDG32 atlas, rendered through the engine
renderer abstraction) and move HUD / build-bar / badges / toasts / minimap / panels into
game-side panels built on it.

## Why (and why this is a big call)
- **Pro:** one unified render surface (consistent pixel scale, camera-aware UI, no DOM
  reflow gotchas — the 2026-06-22 HUD-height fights go away), screenshot/record fidelity,
  composes with the cozy-pivot diegetic look, and — once it's an engine framework —
  **reusable by Farm Valley + future games**.
- **Con / cost (accepted):** a real subsystem — text rendering, canvas-space input
  hit-testing, and the **hidden-DOM a11y mirror** (decision #2 above) — its own
  multi-phase effort. Justified by the cross-game investment thesis (decision #3).

## The six 2026-06-28 Citadel UI todos are CONSUMERS of this framework
([resource-hud](2026-06-28-citadel-ui-resource-hud-bar.md),
[build-cost-hover](2026-06-28-citadel-ui-build-cost-hover-affordability.md),
[upgrade-button](2026-06-28-citadel-ui-building-upgrade-button.md),
[inspect-view](2026-06-28-citadel-ui-building-inspect-view.md),
[villager-job](2026-06-28-citadel-ui-villager-job-personalization.md),
[townhall-button](2026-06-28-citadel-ui-townhall-build-button.md))
— **resolved (decision #1): they depend on `@engine/ui` and are built native to it, NOT
in DOM.** They are blocked on this framework landing. (Their *sim-side* prerequisites —
e.g. a `BUILD_COST` for the build-cost todo, a villager `job` snapshot field — can proceed
independently of the UI layer.)

## Scope (high level — needs its own `@engine/ui` framework brief)
1. **New `@engine/ui` package** — game-agnostic primitives: panel/button/label, a
   **layout** system, **scroll** containers, **text wrap/shaping**, **theming**,
   **animation**, hit-testing. Renders via the engine renderer abstraction
   (**WebGPU + Canvas2D fallback**, so Farm + the headless test renderer work).
2. **Bitmap font** in the EDG32 atlas (deterministic, headlessly testable raster).
3. **Canvas-space input**: hover/click/drag/focus routed to UI widgets.
4. **Hidden DOM a11y mirror** — invisible `<button>`/ARIA/focus tree driving the same
   commands (required deliverable, decision #2).
5. **Game panels move onto it** (Citadel first): HUD/resource readout, build bar, badges,
   toasts, minimap, inspect/upgrade panels, settings — in the Citadel **client**, built
   from `@engine/ui`.
6. EDG32 palette throughout (guard test).

## Acceptance
- `@engine/ui` exists, game-agnostic, rendering on both backends; no DOM UI overlays
  remain over the Citadel world canvas; HUD/build-bar/panels/toasts/minimap/badges render
  in-canvas, EDG32-clean, with working mouse + keyboard input and the hidden-DOM a11y
  mirror; Farm Valley *can* adopt it (proof of cross-game reuse). Determinism untouched
  (render/input only).
