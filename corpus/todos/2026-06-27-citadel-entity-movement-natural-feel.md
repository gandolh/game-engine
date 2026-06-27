---
title: "Citadel — make entities moving through the map feel more natural"
created: 2026-06-27
status: partial
tags: [citadel, render, juice, movement, ux, villagers, raiders]
---

> **Partial — 2026-06-27.** Shipped the biggest win: **render-only position
> interpolation**. New pure `EntityInterpolator` ([entity-interp.ts](../../games/citadel/client/src/render/entity-interp.ts))
> remembers each unit's prev+cur snapshot tile and lerps between them at a render
> `alpha` measured from the inter-snapshot interval (adapts to 1×/2×/4×).
> `pushScene` gained `villagerPos`/`raiderPos` hooks; `main.ts` ingests per
> snapshot and feeds interpolated tiles. Teleports (load/replay, despawn+respawn),
> fresh ids, and pause are SNAPPED, never smeared. The existing screen-space
> heading tracker (lean/squash) now reads continuous deltas → figures lean into
> travel every frame, not just on the snap. Render-only, zero determinism impact.
> 9 interp unit tests + 215 @citadel/client suite green; live-verified. Commit
> `3b19275`. See [log.md](../log.md).
>
> **Still open (deferred):** walk-cadence gait (vs the current idle bob),
> explicit facing/flip, and diagonal rendered-path corner-cutting. The
> interpolation alone already removes the tile-snap; these are polish on top.

# Citadel — entity movement should feel more natural

## Problem

Entities (villagers, raiders, ambient crowd, in-flight armies) move across the
isometric map in a way that reads as mechanical rather than alive. The sim steps
units **tile-to-tile per tick** with no interpolation, so on the render side the
dots/sprites **snap** from one tile center to the next instead of gliding. The
follow-cam comment in [main.ts](../../games/citadel/client/src/main.ts) already
acknowledges this: *"The villager dot tile-steps (no interpolation yet), so the
cam is the smoothing."* The camera glide papers over it only for the one followed
unit; everyone else still steps.

Observed live (Playwright + real-GPU run, 2026-06-27): with population running,
movement is legible but jumpy — there is no positional smoothing, no facing, no
gait, and no easing between tiles.

## Wanted

Movement that reads as natural, **without touching the sim or determinism**.
Candidates (render-only, off the sim path — performance.now, never the tick):

- **Positional interpolation** between the last two snapshots' tile positions
  using the existing snapshot `alpha`/render-clock pattern (mirror how the Farm
  client interpolates between snapshots). This is the single biggest win — it
  turns tile-snaps into continuous glides.
- **Facing / heading** derived from the movement delta so sprites orient along
  their path (or at least flip L/R) instead of always facing camera.
- **Subtle gait**: a small bob/step cadence while walking (there is already an
  idle `bobOffset` in [citadel-fx.ts](../../games/citadel/client/src/render/citadel-fx.ts)
  — extend to a walk cadence) and ease-in/ease-out as a unit starts/stops at a
  building.
- **Path smoothing on diagonals**: tile paths are 4-connected, so routes
  staircase; consider corner-cutting the *rendered* path (not the sim path) so a
  diagonal walk looks like a diagonal, not a stair.
- Keep the **ambient crowd** ([ambient-crowd.ts](../../games/citadel/client/src/render/ambient-crowd.ts))
  consistent with whatever cadence the real villagers get, so the two layers
  don't read differently.

## Notes / constraints

- **Render-only.** The sim FSM + pathing stay authoritative and deterministic.
  Interpolation reads `currentVillagers` / `currentRaiders` / snapshots and the
  main-thread render clock; it must never feed back into a command or the tick.
  No determinism re-proof needed if the sim is untouched.
- Snapshots arrive at `TICKS_PER_DAY=20` and a short visual day — interpolation
  needs to handle units that **despawn** (night/starvation) and **teleport**
  (load/replay) without smearing across the map; snap (don't lerp) when the
  tile delta is implausibly large or the id is new/gone.
- Watch cost: interpolating every unit each frame on the large windowed map must
  stay within the per-frame budget ([build-budget.ts](../../games/citadel/client/src/render/build-budget.ts)).

## Acceptance

- Villagers/raiders **glide** between tiles instead of snapping, verified live in
  `npm run citadel` with population > 0 (use the `window.__citadel` dev hook to
  bootstrap a connected settlement).
- Units that despawn or jump (load/replay) don't visibly smear.
- Frame budget unaffected on the large map; sim determinism unchanged (a
  multi-seed `EXPORT=json` diff is still byte-identical, since nothing in the sim
  moved).
