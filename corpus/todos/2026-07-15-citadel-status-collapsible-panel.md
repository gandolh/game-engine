---
title: "Citadel — status display as a collapsible menu like Farm Valley's HUD panels"
created: 2026-07-15
status: open
tags: [citadel, ui]
---

# Citadel: make the status display a collapsible menu like Farm Valley's

Turn Citadel's status display into a collapsible panel behind a labeled
toggle, matching the collapsible HUD panels Farm Valley got in brief 117.

## Context

- Farm Valley brief [117 — collapsible HUD panels](../briefs/game/done/117-collapsible-hud-panels.md)
  put five panels behind labeled toggles, collapsed by default; the synthesis
  (including the traps hit) is in
  [wiki/player-and-interaction.md](../wiki/player-and-interaction.md).
- Reuse the same `@engine/ui` toggle/panel mechanism rather than reimplementing
  it in the Citadel client; colors from `CITADEL_PAL.*`.

## Acceptance

The Citadel status readout lives behind a labeled toggle and can be collapsed/
expanded like Farm Valley's HUD panels.
