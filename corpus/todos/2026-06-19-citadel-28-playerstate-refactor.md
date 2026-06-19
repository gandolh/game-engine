---
title: "Citadel 28 — PlayerState[] refactor + ownerId on entities (the MP foundation)"
created: 2026-06-19
status: open
tags: [citadel, sim, multiplayer, refactor, foundation]
---

# Citadel 28 — PlayerState[] refactor

**Spine position: A — gates everything.** This is the largest item in the
[Citadel MP epic](closed/2026-06-19-citadel-26-multiplayer-presence-bots-emotes.md) (which
this set decomposes + supersedes). Everything downstream depends on it.

**Lineage:** the shipped Citadel sim has a single implicit "player" — one global
`stockpiles`, one `tier`, one set of decrees, one `defensiveStrength`. MP turns
Citadel into a **competitive/co-op RTS** where N players share one world but each own
private economy/territory/army state. This brief makes the sim multi-player-shaped;
single-player becomes the **1-player case** of the same data model.

## Idea / Scope

Introduce a first-class **`PlayerState[]`** and an **`ownerId`** on per-player entities,
then make every per-player system loop over players instead of acting on global singletons.

- **`PlayerState`** (one per player) owns: `stockpiles`, `pop`, `popCap`, `happiness`,
  `tier`, `territory`, `activeDecrees`, `defensiveStrength`, `fireState`.
- **Shared (NOT per-player):** terrain, the world grid, the tick clock.
- **`ownerId`** added to **buildings + villagers**
  ([building.ts](../../games/citadel/sim-core/src/entities/building.ts) and the
  villager entity).
- **Per-player loops:** every economy / needs-happiness / immigration / tier /
  hazard / siege system iterates per player over its own `PlayerState`
  (production.ts, needs-happiness.ts, immigration.ts, trader.ts, siege-resolution.ts, …).
- **Single-player = 1-player case:** the existing solo game is `players.length === 1`;
  no separate code path.

## Decisions (grilled 2026-06-19)

- **Citadel MP = a competitive/co-op RTS multiplayer mode**, replacing the old narrow
  brief 26 (presence/bots/emotes only).
- **State model = full `PlayerState[]` refactor.** Each player owns
  stockpiles/pop/popCap/happiness/tier/territory/activeDecrees/defensiveStrength/fireState.
  Shared: terrain, the world grid, the tick clock. Buildings + villagers gain an `ownerId`.
- **Single-player is the 1-player case** — no parallel code path.
- **Every economy/needs/siege/tier/hazard system loops per player.**
- **Determinism stays load-bearing** — no `Math.random`/`Date.now` in sim; the
  command-log remains the sync + save substrate. The per-player split must not introduce
  iteration-order nondeterminism (iterate players in a stable id order).

## Acceptance

- A `PlayerState[]` exists; stockpiles/pop/popCap/happiness/tier/territory/activeDecrees/
  defensiveStrength/fireState are per-player; terrain + grid + clock are shared.
- Buildings and villagers carry `ownerId`; every per-player system loops per player in a
  stable order.
- Solo play runs unchanged as the `players.length === 1` case.
- **Determinism gate:** sim-touching at the deepest level. Multi-seed `EXPORT=json`
  re-proof at default `TICKS_PER_DAY=20` (per the determinism-bomb memory note), plus the
  full phase test set — **ask before running**.
- `npm run typecheck` + targeted vitest green.

## Dependencies / sequence

- **Depends on:** nothing (foundation). Gates **all** of briefs 29–37.
- **Next:** [29 world-256-townhall](2026-06-19-citadel-29-world-256-townhall.md) (B).
