---
title: "Farm Valley UI — Farmers window flickers when changes are applied (layout shift?)"
created: 2026-07-15
status: closed (2026-07-16, `0cae160` — layout-reassignment dropped align:stretch; width churned with row text)
tags: [farm, ui, bug]
---

# Farmers window flickers when changes are applied

The Farmers window/panel flickers whenever changes are applied. Suspected cause
(user's hypothesis): a layout-shifting problem — content resizing on update and
forcing the panel to re-lay-out every frame or every data refresh.

## Context

- Farm Valley in-canvas UI is built on [@engine/ui](../../engine/ui/); the
  player-facing panel/HUD landscape is described in
  [wiki/player-and-interaction.md](../wiki/player-and-interaction.md).
- Brief 117 (collapsible HUD panels, done 2026-07-15) recently reworked the HUD
  panels behind labeled toggles — worth checking whether the flicker predates or
  was introduced/exposed by that change.
- Likely angle: per-update measurement/size churn (e.g. row heights or panel
  height derived from content that momentarily renders empty), causing a
  visible one-frame shift.

## Acceptance

Farmers window stays visually stable (no flicker, no jumping) while its data
updates and when changes are applied.

## Resolution (2026-07-16)

Root cause: in `observer-panel.ts` the "visible rows" mirror reassigned `visibleRows.layout =
{ width, height }`, silently dropping `align: "stretch"` (and `gap`) back to theme defaults — each
farmer row then sized to its own intrinsic text width, which changes almost every tick as
gold/state/AP text updates. Not introduced by brief 117; latent misuse of the `@engine/ui` layout
model exposed by frequent data refresh. Fix folds width/height into the same layout literal and
adds a strict bottom-edge cull (the box-mirror scroll pattern has no real clipping). Regression
tests pin panel width against row-text length. Browser-verified: panel geometry pixel-stable
across data churn (AP text even grew "(penalty)" suffixes). The trap is documented in
[player-and-interaction.md](../../wiki/player-and-interaction.md).
