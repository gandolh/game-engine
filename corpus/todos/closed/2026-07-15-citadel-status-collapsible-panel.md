---
title: "Citadel — status display as a collapsible menu like Farm Valley's HUD panels"
created: 2026-07-15
status: closed (2026-07-16, `d3952ad` — Status toggle, default OPEN, citadel.ui.panels.v1)
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

## Resolution (2026-07-16)

`createStatusPanel` (new `main/status-panel.ts`) wraps the unmodified siege HUD behind an
always-visible "Status" toggle using brief 117's exact composition pattern (children rebuilt
wholesale on toggle; no `.layout` reassignment; first-frame size-key sentinel in render-loop so a
cold-collapsed toggle is never a zero-rect). **Deviation from Farm's default-closed: Status defaults
OPEN** — it is the ambient siege warning signal (fire/disease/threat/keep), not an opt-in data dive;
hiding it by default would defeat it. Persistence is a from-scratch Citadel port of Farm's
panel-prefs (`citadel.ui.panels.v1`, write-through, in-memory fallback, `__proto__`-safe allowlist)
— games never import each other. `status-panel.ts` is deliberately separate from `hud-panels.ts` so
it unit-tests without `sim-client.ts`'s import-time live client. 16 new tests; browser-verified incl.
persistence round-trip + first-frame clickability. **Follow-up filed in log:** pre-existing gap —
`input.ts` doesn't forward keydown to `siegeDispatcher`, so the toggle isn't canvas-Tab reachable
(mouse + a11y-mirror paths work).
