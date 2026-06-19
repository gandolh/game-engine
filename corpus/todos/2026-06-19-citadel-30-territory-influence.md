---
title: "Citadel 30 — Influence-radius territory + build-gating"
created: 2026-06-19
status: open
tags: [citadel, sim, world, territory, multiplayer]
---

# Citadel 30 — Influence-radius territory

**Spine position: C (needs [28](2026-06-19-citadel-28-playerstate-refactor.md),
[29](2026-06-19-citadel-29-world-256-townhall.md)).**
Part of the [Citadel MP epic](closed/2026-06-19-citadel-26-multiplayer-presence-bots-emotes.md).

**Lineage:** with N players on one 256² grid and a town-hall anchor each, a player needs
a defined claim of tiles to build on and defend. `PlayerState.territory` (from brief 28)
is filled in here.

## Idea / Scope

Compute each player's **territory** as an influence radius from their owned buildings,
auto-grown as they build, and gate placement to that claim.

- **Territory = all tiles within radius R** of the town hall **+ any owned building.**
  Auto-grows as a player builds more buildings (each adds its own radius).
- **Recompute on building-change**, the same way the existing road-connectivity pass
  recomputes — a derived pass over owned buildings, not stored per-tile state that can drift.
- **Build-gating:** a player may build only within **their territory ∪ adjacent unclaimed
  tiles** (so a player can expand into open ground but not into a rival's claim).
- **Overlap / contested-tile rule:** left as **in-brief tuning** (e.g. closest-town-hall
  wins, or no-build contested band) — resolve during implementation.

## Decisions (grilled 2026-06-19)

- **Territory = influence radius from owned buildings** — your territory is all tiles
  within radius R of your town hall + any owned building; **auto-grows as you build.**
- **Recomputed on building-change** like the existing road-connectivity pass.
- **You may build only within your territory ∪ adjacent unclaimed tiles.**
- **Overlap / contested-tile rule = in-brief tuning** (left open deliberately).
- **Determinism stays load-bearing** — territory is a deterministic derived pass over the
  owned-building set; no `Math.random`/`Date.now`.

## Acceptance

- Each `PlayerState.territory` = tiles within radius R of that player's town hall + owned
  buildings; placing/removing a building recomputes it.
- Placement commands are accepted only inside territory ∪ adjacent-unclaimed; rejected
  elsewhere (with feedback).
- Recompute is a derived pass (mirrors road-connectivity), not drift-prone per-tile storage.
- **Determinism gate:** sim-touching. Multi-seed `EXPORT=json` re-proof + phase tests —
  **ask before running**.
- `npm run typecheck` + targeted vitest green.

## Dependencies / sequence

- **Depends on:** [28](2026-06-19-citadel-28-playerstate-refactor.md) (A),
  [29](2026-06-19-citadel-29-world-256-townhall.md) (B).
- **Unblocks:** [32 pvp-armies](2026-06-19-citadel-32-pvp-armies.md) (E).

## Open tuning (resolve in-brief)

Radius R; overlap/contested-tile rule; whether adjacency is 4- or 8-connected.
