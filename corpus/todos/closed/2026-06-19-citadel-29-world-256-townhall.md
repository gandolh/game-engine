---
title: "Citadel 29 — 256×256 world + town-hall building + match-start placement"
created: 2026-06-19
status: open
tags: [citadel, sim, world, multiplayer]
---

# Citadel 29 — 256×256 world + town-hall

**Spine position: B (needs [28](2026-06-19-citadel-28-playerstate-refactor.md)).**
Part of the [Citadel MP epic](closed/2026-06-19-citadel-26-multiplayer-presence-bots-emotes.md).

**Lineage:** the shipped world is 96×96 with a single implicit player at a fixed plot.
An MP RTS needs room for N players to claim and build outward from independent starts.

## Idea / Scope

Widen the world and add the **town hall** as each player's anchor building, placed by
the player at match start.

- **World → 256×256, configurable.** Drive the dimension from config, not a literal
  (it feeds `pathfinder.ts` `width*height`, region baking, snapshot extents).
- **New `town-hall` building.** Each player's anchor; its destruction = elimination
  (consumed by [32 pvp-armies](2026-06-19-citadel-32-pvp-armies.md)).
- **Match-start placement:** at match start each player chooses where to place their
  town hall **on an unclaimed tile**, then builds outward from it.
- This **un-parks** [21 render-windowed grid](2026-06-19-citadel-21-render-windowed-grid.md)
  and [22 incremental build queue](2026-06-19-citadel-22-incremental-build-queue.md): the
  256×256 world is now the committed large-map consumer those briefs were waiting for.

## Decisions (grilled 2026-06-19)

- **World = 256×256 (configurable).**
- **New town-hall building**; at match start each player chooses where to place their
  town hall on an **unclaimed tile**, then builds outward.
- This **un-parks briefs 21/22** — the large-map renderer + incremental build queue now
  have a real consumer.
- **Determinism stays load-bearing** — placement is a command in the authoritative log;
  no `Math.random`/`Date.now`.

## Acceptance

- World dimensions read from config (default 256×256); all grid-sized allocations + the
  pathfinder + region baking + snapshots track the configured size.
- A `town-hall` building type exists; each player places exactly one on an unclaimed tile
  at match start via a command, then builds outward.
- Briefs 21/22 reference this brief as their now-committed consumer.
- **Determinism gate:** sim-touching (world extents feed pathing + baking). Multi-seed
  `EXPORT=json` re-proof + phase tests — **ask before running**.
- `npm run typecheck` + targeted vitest green.

## Dependencies / sequence

- **Depends on:** [28](2026-06-19-citadel-28-playerstate-refactor.md) (A).
- **Unblocks:** [30 territory](2026-06-19-citadel-30-territory-influence.md) (C),
  [31 pathfinder-perf](2026-06-19-citadel-31-pathfinder-perf.md) (D), and un-parks 21/22 (K).
