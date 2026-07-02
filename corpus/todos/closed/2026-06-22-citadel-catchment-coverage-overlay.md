---
title: "Citadel — OpenTTD-style service catchment radius + coverage overlay (legibility fix)"
created: 2026-06-22
status: done
resolved: 2026-06-22
tags: [citadel, ux, gameplay, ui, openttd-influence]
source: "OpenTTD research, 2026-06-22"
---

> **♻️ RATIONALE PARTLY SUPERSEDED (2026-06-28 cozy pivot).** The shipped overlay
> **stands and is kept** (the cozy pivot leans on it harder — see pivot Phase F). But
> this todo's *justification* cites the "fire pushes buildings ≥5 apart / spacing
> tension is intended design" stance, which the pivot **retired** (fire is now gentle
> texture, density isn't punished). Read the overlay work as current; read its
> spacing-tension rationale as historical. Current design of record:
> [2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md](2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md).

> **✅ DONE 2026-06-22.** All three scope items shipped, render/UI-only (no sim
> change). New pure `render/coverage.ts` mirrors the sim's coverage geometry
> (same `serviceCenter` = `b.x+floor(w/2)`, same `SERVICE_RADII`, same Manhattan
> test) so the visuals can't drift; `pushCatchment` in
> [citadel-renderer.ts](../../games/citadel/client/src/render/citadel-renderer.ts)
> stamps flat iso ground diamonds on a new `LAYER_COVERAGE` (just below the
> ghost). **(1) Placement ring** — selecting any service building (chapel/market/
> watchpost/tower/garrison/keep/town-hall/well/healer) draws its Manhattan reach
> around the ghost (perimeter brighter = ring, faint fill inside), tinted by need
> (faith=mauve / safety=skyBlue / goods=gold), neutral cream otherwise. **(2)
> Post-place toast** — placing a chapel/market/watchpost that covers 0 homes
> toasts `"<type> covers 0 homes — move it closer"`. **(3) Overlay toggle** —
> `C` washes the union of all faith/safety/goods catchments by need so gaps show
> at a glance (guarded against form-field focus + Ctrl/Cmd). Unit-tested in
> `render/coverage.test.ts`; client typecheck + 202 client tests + palette guard
> all green. Kept in `todos/` (not moved to `closed/`) so the sibling briefs'
> relative links stay valid.
>
> **Playtested 2026-06-22 (live client, Chrome+WebGPU).** All three confirmed in
> the real renderer: the chapel placement ring draws a tinted Manhattan reach
> around the ghost; `C` toggles three distinct faith/safety/goods washes; placing
> a chapel ~14 tiles from the houses fired `"chapel covers 0 homes — move it
> closer"` and the overlay then showed the faith catchment visibly stranded off
> the houses (the exact P2 gap, now legible). Drove real UI gestures via a new
> DEV-only `__citadel.tileToScreenCss(tx,ty)` hook in
> [main.ts](../../games/citadel/client/src/main.ts) (projects a tile to a CSS-px
> point so a harness can hover/click specific tiles, not just send commands).

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
