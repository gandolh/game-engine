---
title: "Farm Valley — highlight Pip's farm so the player can find it at full zoom-out"
created: 2026-07-15
status: closed (2026-07-16, `528bd4d` — screen-space PIP'S FARM pin past zoom <= 1.2)
tags: [farm, ui, render, player]
---

# Highlight Pip's farm at full zoom-out

When the camera is fully zoomed out, the player's own farm (Pip's) is
indistinguishable from the other 20 AI farms. Add a highlight or marker so the
user can identify their farm at a glance.

## Context

- Pip is the playable farmer; player-facing systems are catalogued in
  [wiki/player-and-interaction.md](../wiki/player-and-interaction.md).
- Design is open: could be an outline/tint on the plot, a banner/flag sprite,
  or a screen-space marker that only appears past a zoom threshold. Whatever is
  chosen must use EDG32 palette roles (no raw hex).

## Acceptance

At full zoom-out, Pip's farm is immediately identifiable among the 21 farms.

## Resolution (2026-07-16)

Design chosen: a screen-space pin (gold diamond on a pole + "PIP'S FARM" label on a dark
backing, pulsing alpha), anchored above the static `farm-pip` region's north edge, shown at
zoom <= 1.2 (DEFAULT_ZOOM 3, MIN_ZOOM 0.5). Screen-space so the marker stays a constant readable
size at any zoom; anchored to the region (a stable FixedRegionId derived from WORLD_GEN_SEED) rather
than live-tracking Pip, so it is correct even while Pip wanders. EDG32 roles only; 8 unit tests pin
the threshold boundary/monotonicity + anchor math. Browser-verified at full zoom-out among all 21
farms. Threshold/size constants are named at the top of `pip-farm-marker.ts` if it needs retuning.
