---
title: "Citadel UI — top-of-screen resource readout (all goods)"
created: 2026-06-28
status: todo
tags: [citadel, ui, hud, economy]
---

# Resource HUD — show how much of each resource the player has

> **UNBLOCKED 2026-06-30** — `@engine/ui` shipped ([brief 17](../briefs/engine/done/17-engine-ui-framework.md)); build this panel native to it (`@engine/ui` widget tree + the Citadel HUD pattern in `games/citadel/client/src/ui/resource-hud.ts`), not DOM. Depends on
> [render-all-gui-in-game / @engine/ui](2026-06-28-citadel-ui-all-rendered-in-game.md).
> (Data is ready: `snapshot.stockpiles` already carries every good.) A HUD panel scaffold already exists from the pilot — extend it to show ALL goods: grain/flour/bread/wood/stone/planks/tools.

Display the player's current stockpile of **each resource** in the in-game UI (top of
screen), not just the two shown today.

## Current state
- The HUD ([index.html](../../games/citadel/client/index.html), `#hud` row) shows only
  `#hud-bread` and `#hud-wood` (plus tier/day/pop/happiness/threat).
- The full stockpile is already in the snapshot: `snapshot.stockpiles` is a
  `Readonly<Record<string, number>>`
  ([snapshot/index.ts:69](../../games/citadel/sim-core/src/snapshot/index.ts#L69)) —
  grain, flour, bread, wood, stone, planks, tools.
- So this is **pure client rendering** — no sim change.

## Scope
- A compact, always-visible resource strip (top of the canvas / HUD row) with one chip
  per good: a small EDG32 icon + count, updated each snapshot. Order by the production
  chain (grain → flour → bread; wood → planks; stone → tools) for legibility.
- Keep it within the existing fixed-height `#hud` (`nowrap` + `overflow-x:auto`) so it
  doesn't reflow the canvas, per the 2026-06-22 HUD layout decision (see
  [citadel-overview.md](../wiki/citadel-overview.md)). Consider a dedicated top strip
  floating over the canvas instead, if the HUD row gets too crowded.
- EDG32 palette only (guard test).

## Acceptance
- Every tradeable good shows a live count in the in-game UI; layout stays fixed-height
  (no canvas reflow on change). EDG32 + tests green.
