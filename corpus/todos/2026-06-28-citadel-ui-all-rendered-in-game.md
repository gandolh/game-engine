---
title: "Citadel — render ALL GUI in-game (in the WebGPU canvas, not DOM overlays)"
created: 2026-06-28
status: todo
tags: [citadel, ui, render, webgpu, architecture]
---

# All GUI rendered in-game (inside the WebGPU canvas)

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

So "render all GUI in-game" is an **architectural shift**: build a WebGPU UI layer
(textured quads + a bitmap/SDF font in the EDG32 atlas) and move HUD / build-bar /
badges / toasts / minimap / panels into it.

## Why (and why this is a big call)
- **Pro:** one unified render surface (consistent pixel scale, camera-aware UI, no DOM
  reflow gotchas — the 2026-06-22 HUD-height fights go away), screenshot/record fidelity,
  and it composes with the cozy-pivot diegetic look.
- **Con / cost:** it's a real subsystem — text rendering (bitmap font atlas), input
  hit-testing in canvas space (buttons, hover, drag), focus/accessibility (DOM gives a11y
  for free; canvas UI must re-earn it), and re-implementing every existing panel. This is
  **large** — likely its own multi-phase effort.

## ⚠️ Interaction with the six 2026-06-28 UI todos
The just-filed UI todos
([resource-hud](2026-06-28-citadel-ui-resource-hud-bar.md),
[build-cost-hover](2026-06-28-citadel-ui-build-cost-hover-affordability.md),
[upgrade-button](2026-06-28-citadel-ui-building-upgrade-button.md),
[inspect-view](2026-06-28-citadel-ui-building-inspect-view.md),
[villager-job](2026-06-28-citadel-ui-villager-job-personalization.md),
[townhall-button](2026-06-28-citadel-ui-townhall-build-button.md))
all assume **DOM** widgets. **Decision needed before building them:** either (a) build
them as DOM now and port later, or (b) stand up the in-game UI layer **first** and build
them natively in it. Recommend grilling this sequencing — doing the six in DOM then
rewriting them in-canvas is double work.

## Scope (high level — needs its own breakdown)
1. WebGPU UI pass: textured-quad UI layer + a bitmap/SDF **font** in the EDG32 atlas.
2. Canvas-space **input**: hit-testing, hover, click, drag for buttons/panels.
3. Port each surface: HUD/resource readout, build bar, badges, toasts, minimap, building
   inspect/upgrade panels, settings.
4. **Accessibility plan** — canvas UI loses DOM a11y; decide the mitigation (or keep a
   minimal DOM a11y mirror).
5. EDG32 palette throughout (guard test).

## Acceptance
- No DOM UI overlays remain over the world canvas; HUD, build bar, panels, toasts,
  minimap, and badges all render inside the WebGPU canvas, EDG32-clean, with working
  mouse input and a stated accessibility approach. Determinism untouched (render/input only).
