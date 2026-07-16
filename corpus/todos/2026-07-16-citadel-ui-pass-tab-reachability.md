---
title: "Citadel — next UI pass: Status toggle keyboard reachability (+ batched UI nits)"
created: 2026-07-16
status: open
tags: [citadel, ui, a11y, batch]
---

# Citadel UI pass: Status toggle Tab-reachability

Batch-with-next-UI-pass item (user call 2026-07-16): `input.ts` doesn't forward
keydown to `siegeDispatcher`, so the new collapsible "Status" toggle (d3952ad)
isn't reachable via canvas Tab focus. Mouse and the a11y-mirror screen-reader
path both work — this is the keyboard-only gap. Pre-existing (siegeHud was
read-only before), surfaced by the 2026-07-15 collapsible-panel todo.

## Scope

- Forward keydown routing to `siegeDispatcher` in `input.ts`, consistent with
  how `uiDispatcher`/`buildBarDispatcher`/`settingsDispatcher` are handled.
- While in here, sweep for any other dispatcher that renders interactive nodes
  but is missing from the keydown chain.
- This file is the collection point: append further small Citadel UI nits here
  as they're found, and run them as one batched UI pass.

## Acceptance

- The Status toggle can be focused and activated with the keyboard alone in a
  real browser; existing Tab order through the other panels unchanged.
