---
title: "Citadel — OpenTTD-style service catchment radius + coverage overlay (legibility fix)"
created: 2026-06-22
status: open
tags: [citadel, ux, gameplay, ui, openttd-influence]
source: "OpenTTD research, 2026-06-22"
---

# Citadel — service catchment radius + coverage overlay

**OpenTTD-influence brief.** OpenTTD makes spatial service a *visible, first-class*
concept: every station has a drawn **catchment area**, and an overlay shows exactly
which tiles it serves. An industry/house only feeds or accepts cargo if it sits
inside that footprint, so "did I place this in range?" is never a guess
([catchment / coverage docs](https://wiki.openttd.org/en/Manual/Cargo)). We already
have the underlying mechanic (distance-based coverage) but **none of the
legibility** — and that gap is our single biggest "feels broken" moment.

## Why (this is the fix for an existing playtest blocker)

This is the direct remedy for **P2** in
[2026-06-22-citadel-playtest-findings.md](2026-06-22-citadel-playtest-findings.md):
chapel/market/watchpost coverage is purely Manhattan-distance ≤ radius
([needs-happiness.ts:76-96](../../games/citadel/sim-core/src/systems/needs-happiness.ts#L76),
radius 8, [building.ts:97](../../games/citadel/sim-core/src/entities/building.ts#L97)),
and in the `grow` scenario the services sit ~11 tiles from the houses → faith/safety
read **0% forever** with no signal. The spacing tension (fire pushes buildings ≥5
apart; service radius pulls them together) is **intended design**
(see [citadel-overview.md](../wiki/citadel-overview.md)) — so the fix is *legibility,
not re-tuning*. Show the coverage; keep the tradeoff.

## Scope

1. **Placement ring** — when a service building (chapel/market/watchpost, anything
   with a coverage radius) is selected for placement, draw its radius ring around
   the ghost (the ghost already exists). The player sees the reach *before*
   committing. This is the highest-value, lowest-risk piece — do it first.
2. **Post-place feedback toast** — on successful placement, if `housesInRadius === 0`,
   toast `"chapel covers 0 homes — move it closer"` (use the existing transient
   toast, [ui/toast.ts](../../games/citadel/client/src/ui/toast.ts)). Pairs with
   the P1 "placement silently fails" finding: *every ineffective placement should
   say why.*
3. **Coverage overlay toggle** — a hotkey (e.g. `C`) tints tiles by need coverage
   (faith / safety / goods), like OpenTTD's catchment overlay. Gaps become visible
   at a glance. Render-only; reads the same distance math the sim already uses.

## Constraints

- **Render/UI only — no sim change.** The coverage math
  ([needs-happiness.ts](../../games/citadel/sim-core/src/systems/needs-happiness.ts))
  stays authoritative; the overlay/ring *visualise* it, they don't recompute a
  second source of truth. Read radius from the same constant the sim reads.
- EDG32 palette only (the guard test walks the client) — tints come from `EDG.*`.
- Works in the WebGPU canvas + DOM-overlay HUD model already in place; the ring is
  a ground decal in iso space, the toggle a tile tint pass, toasts are DOM.

## Acceptance

- Selecting a service shows its radius ring on the ghost; placing one that covers
  no homes produces a visible cue.
- A coverage overlay toggle reveals faith/safety/goods gaps across the map.
- After this, a player in the `grow` scenario can *see why* faith/safety are 0%
  and fix it by moving the building — closing the P2 "no feedback" hole.

## Related

- Fixes P2 in [playtest-findings](2026-06-22-citadel-playtest-findings.md);
  complements P1 (silent placement failure).
- The "production responds to service" half of the OpenTTD economy lives in the
  sibling brief
  [2026-06-22-citadel-two-way-service-economy.md](2026-06-22-citadel-two-way-service-economy.md).
