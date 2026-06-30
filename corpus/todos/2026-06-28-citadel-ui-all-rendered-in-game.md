---
title: "@engine/ui — a cross-game, backend-agnostic in-canvas UI framework (all GUI rendered in-game)"
created: 2026-06-28
status: in-progress
tags: [citadel, farm, engine, ui, render, architecture, framework]
---

# `@engine/ui` — render ALL GUI in-game, as a reusable cross-game framework

> **Update 2026-06-30 — framework SHIPPED** ([brief 17](../briefs/engine/done/17-engine-ui-framework.md), branch `engine-ui-framework`). The `@engine/ui` package + the resource-HUD **pilot consumer** are done (pending an in-browser WebGPU visual check). **Remaining:** migrate the other DOM UI (build bar, settings, minimap, toasts, badges, follow-HUD) + the other 5 panel todos, then full DOM-overlay removal (the acceptance below). The 6 panel todos are now unblocked.

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
