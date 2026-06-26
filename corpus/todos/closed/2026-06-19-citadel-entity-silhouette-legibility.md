---
title: "Citadel — entity legibility via orientation + silhouette (villagers, crowd, raiders)"
created: 2026-06-19
status: done
tags: [citadel, render, art, quick-win]
---

# Citadel — entity legibility via orientation + silhouette

> **DONE (2026-06-26).** Raiders shaped by strength tier (weak→narrow, strong→broad,
> elite→tall+crimson) via `raiderTier`/`raiderQuad`. Villagers lean+squash along a
> render-only frame-to-frame screen heading (`VillagerHeadingTracker`). Ambient crowd
> leans into its heading-to-target. All render-only/EDG32/determinism-safe; client
> tests + palette guard green. See log.md 2026-06-26.

Moving entities are featureless squares: villagers and ambient pedestrians are
direction-less dots; raiders differ only by size. Cheap render-only changes make
agents read as agents and make threat read at a glance — no sprites required.

## Context

- **Villagers** — [quads.ts:174-181](../../games/citadel/client/src/render/quads.ts#L174)
  `villagerQuad()` is a 0.7-tile centered square colored by FSM state, always
  axis-aligned. They already walk toward a target tile, so the movement vector is
  available: rotate/elongate the quad along the direction of travel (a taller-than-
  wide quad facing its heading) so streets show flow, not a static grid of dots.
- **Ambient crowd** — [ambient-crowd.ts](../../games/citadel/client/src/render/ambient-crowd.ts)
  draws pedestrians as 0.35-tile squares in 5 EDG tints with `rotation = 0`. The
  wander target is computed per agent; use the heading to set the quad rotation so
  the crowd appears to move with purpose.
- **Raiders** — [quads.ts:183-190](../../games/citadel/client/src/render/quads.ts#L183)
  `raiderQuad()` scales a red square by strength only. Add a silhouette cue: weak =
  thin/small, strong = wide/blocky, elite = diamond or plus — so raid composition
  and threat are instantly legible during the march (pairs well with the
  [threat-mechanical-consequence](2026-06-19-citadel-threat-mechanical-consequence.md)
  gameplay todo).

All render-only, EDG32 (palette guard enforced), and must derive orientation from
already-rendered snapshot motion — never from the sim's RNG and never fed back into
the sim.

## Acceptance

- Villagers + ambient crowd visibly orient to their direction of travel.
- Raider shape communicates strength tier, not just size.
- Pure render, palette-clean, typecheck + tests green; legibility win visible in
  `npm run citadel`.
