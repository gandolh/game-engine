---
title: "Citadel 33 — Per-player PvE raiders + hazards in MP"
created: 2026-06-19
status: open
tags: [citadel, sim, pve, hazards, multiplayer, determinism]
---

# Citadel 33 — Per-player PvE in MP

**Spine position: F (needs [28](2026-06-19-citadel-28-playerstate-refactor.md),
[31](2026-06-19-citadel-31-pathfinder-perf.md)).**
Part of the [Citadel MP epic](closed/2026-06-19-citadel-26-multiplayer-presence-bots-emotes.md).

**Lineage:** the shipped game runs NPC raiders + fire/disease hazards against the single
player. MP **keeps PvE on** alongside PvP, so the threat model is per-player.

## Idea / Scope

Run NPC raiders + fire/disease hazards **per player** in MP, alongside the PvP layer.

- **Per-player NPC raiders:** raid spawning + auto-pathing targets each player's own
  buildings/keep, using each player's `defensiveStrength` (from brief 28).
- **Per-player hazards:** fire/disease run against each player's `fireState` / population.
- **This multiplies per-player raid spawning + pathing** — which is exactly why
  [31 pathfinder-perf](2026-06-19-citadel-31-pathfinder-perf.md) is a hard dependency (N
  players × raiders × pathfinds at 256²).

## Decisions (grilled 2026-06-19)

- **PvE = KEEP ON in MP.** Per-player NPC raiders + fire/disease hazards run **alongside**
  PvP.
- **Per-player multiplication is acknowledged** — raid spawning + pathing scales with player
  count, which is the load-bearing reason for the pathfinder-perf brief.
- **Determinism stays load-bearing** — per-player raid spawn timing + pathing flow through
  the seeded `Rng` (named `fork` per player), never `Math.random`/`Date.now`; raids resolve
  via the same deterministic siege math.

## Acceptance

- NPC raiders spawn and path per player against that player's buildings, using that player's
  `defensiveStrength`.
- Fire/disease hazards run per player against per-player `fireState`/population.
- PvE and PvP coexist in one match.
- Per-player raid RNG is seeded/forked so add/remove of a player doesn't perturb others'
  streams.
- **Determinism gate:** sim-touching (spawn + pathing + hazard). Multi-seed `EXPORT=json`
  re-proof at default `TICKS_PER_DAY=20` + phase tests — **ask before running**.
- `npm run typecheck` + targeted vitest green.

## Dependencies / sequence

- **Depends on:** [28](2026-06-19-citadel-28-playerstate-refactor.md) (A),
  [31](2026-06-19-citadel-31-pathfinder-perf.md) (D).
