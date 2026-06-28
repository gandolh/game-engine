---
title: "Citadel UI — click a building → upgrade button showing upgrade cost"
created: 2026-06-28
status: todo
tags: [citadel, ui, economy, building, upgrades]
---

# Click a building → floating Upgrade button with cost

> **⛓️ BLOCKED ON `@engine/ui` (grilled 2026-06-28, round 7).** The floating button +
> selection UI are in-game UI → built in the framework, not DOM. Depends on
> [render-all-gui-in-game / @engine/ui](2026-06-28-citadel-ui-all-rendered-in-game.md).
> (The sim mechanic it surfaces — `upgradeBuilding` / `upgradeCost` — already exists.)

Clicking a building should surface an **Upgrade button** over it, labelled with the
**resource cost** to upgrade to the next level.

## Current state — sim side already exists
- The `upgradeBuilding` command is wired in
  [sim-bootstrap.ts:572](../../games/citadel/sim-core/src/sim-bootstrap.ts#L572):
  owner-only, debits `upgradeCost(b.type, nextLevel)` from the stockpile, tier-gated,
  capped at `BUILDING_MAX_LEVEL` (3). Costs: L2 `{planks:4, stone:4}`, L3
  `{planks:8, stone:6, tools:2}` ([building.ts:`upgradeCost`](../../games/citadel/sim-core/src/entities/building.ts)).
- So this is **client-side surfacing** of an existing mechanic — no sim change needed.
- Building runtime `level` is in `BuildingRuntimeState`; ensure it's in the snapshot so
  the client knows the *next* level and its cost.

## Scope
1. **Building selection** — clicking a building tile (not in a placement mode) selects it.
   Today canvas click only does follow-cam / place / demolish
   ([main.ts:280](../../games/citadel/client/src/main.ts#L280)); add a select path that
   resolves the clicked tile → building (reuse the footprint→building index from the
   occupancy-badge work).
2. **Floating Upgrade button** — a pooled DOM overlay (like `OccupancyBadgeLayer`)
   positioned over the selected building via the shared `tileToScreenCss`. Label shows
   the cost to reach the next level (e.g. "Upgrade → L2: 4 planks, 4 stone"). **Disabled**
   when unaffordable / at max level / tier-locked (mirror the sim's reject reasons).
3. Clicking it sends `upgradeBuilding`; the button updates on the next snapshot.

> Pairs naturally with the **building-inspect view** todo
> ([2026-06-28-citadel-ui-building-inspect-view](2026-06-28-citadel-ui-building-inspect-view.md))
> — the upgrade button can live inside that panel rather than as a separate floater.
> Decide one home for "what happens when you click a building".

## Acceptance
- Clicking a building shows an upgrade affordance with the real cost; clicking it upgrades
  (when affordable/eligible); disabled state reads correctly. EDG32 + tests green.
