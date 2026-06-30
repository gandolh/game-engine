---
title: "Citadel UI — click a building → inspect panel (description, production rate, details)"
created: 2026-06-28
status: todo
tags: [citadel, ui, building, legibility, cozy-pivot]
---

# Click a building → inspect view (description + production rate + scope)

> **UNBLOCKED 2026-06-30** — `@engine/ui` shipped ([brief 17](../briefs/engine/done/17-engine-ui-framework.md)); build this panel native to it (`@engine/ui` widget tree + the Citadel HUD pattern in `games/citadel/client/src/ui/resource-hud.ts`), not DOM. Depends on
> [render-all-gui-in-game / @engine/ui](2026-06-28-citadel-ui-all-rendered-in-game.md).
> (Most of its data already exists in `PRODUCTION_DEFS` / runtime state.)

Clicking a building should open a view describing it: a short **description**, its
**production rate**, and details about its **scope** (coverage radius, inputs/outputs,
workers, level).

This is a **legibility** feature — it serves the cozy pivot's "read the puzzle" goal
(decisions #2/#3 of [the cozy-pivot build order](2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md))
by making *what a building does and how well it's doing* explicit on demand.

## Current state — most data already exists in defs/snapshot
- Production config per type: `PRODUCTION_DEFS`
  ([building.ts](../../games/citadel/sim-core/src/entities/building.ts)) — `inputGood`,
  `outputGood`, `inputPerCycle`, `outputPerCycle`, `ticksPerCycle`, `workerSlots`,
  `terrainReq`.
- Coverage radius: `SERVICE_RADII` / `SERVICE_RECTS` (same file).
- Live runtime per building: `BuildingRuntimeState` (`outputBuffer`, `workerCount`,
  `connected`, `level`) — ensure the relevant bits are in the snapshot for the panel.
- So this is largely **client-side surfacing** + a static per-type description string.

## Scope
1. **Building selection** (shared with the
   [upgrade-button todo](2026-06-28-citadel-ui-building-upgrade-button.md)) — clicking a
   building tile selects it (footprint→building index).
2. **Inspect panel** — a DOM panel (floating over the canvas, like the trader panel, so
   it doesn't reflow the HUD) showing:
   - **Name + one-line description** (new static per-type copy).
   - **Production rate** — derive a human "X bread/day" from `outputPerCycle ×
     cycles/day × level multiplier` (and the seasonal grain multiplier for farms); show
     **effective** rate (note when throttled by no worker / not connected / buffer full —
     which, post cozy-pivot Phase H, becomes "slowed", not "stopped").
   - **Scope/details** — coverage radius (for services), inputs→outputs, workers,
     current level, connected y/n.
3. **Fold in the upgrade button** here (decide: the inspect panel is the single home for
   "clicked a building" — upgrade lives inside it rather than as a separate floater).

## Acceptance
- Clicking a building opens a panel with its description, a readable production rate, and
  its scope/coverage; the panel floats (no canvas reflow); EDG32 + tests green.
