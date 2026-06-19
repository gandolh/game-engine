---
title: "Citadel 32 — PvP launch-attack armies + town-hall elimination"
created: 2026-06-19
status: open
tags: [citadel, sim, combat, multiplayer, determinism]
---

# Citadel 32 — PvP armies

**Spine position: E (needs [28](2026-06-19-citadel-28-playerstate-refactor.md),
[30](2026-06-19-citadel-30-territory-influence.md),
[31](2026-06-19-citadel-31-pathfinder-perf.md)).**
Part of the [Citadel MP epic](closed/2026-06-19-citadel-26-multiplayer-presence-bots-emotes.md).

**Lineage:** generalizes the **shipped raider/siege model** (raiders auto-path to the keep;
[siege-resolution.ts](../../packages/citadel-sim-core/src/systems/siege-resolution.ts)
resolves abstract deterministic siege math) from PvE-vs-keep to **player-vs-player.**

## Idea / Scope

Let a player spend resources to launch an army at a targeted enemy building or town hall;
resolve it with the existing siege math; destroying a town hall eliminates that player.

- **Launch-attack command:** spend resources **and/or conscript pop** to launch an army
  that **auto-paths to a TARGETED enemy building / town-hall.** (Conscription ties into the
  shipped decree from [citadel-09](closed/2026-06-19-citadel-09-interlocking-decrees.md).)
- **Resolution:** the existing abstract deterministic siege math
  ([siege-resolution.ts](../../packages/citadel-sim-core/src/systems/siege-resolution.ts))
  **generalized to player-vs-player** (attacker army strength vs defender
  `defensiveStrength`). Reuses the per-player split from brief 28.
- **NO RTS unit micro, NO commandable stacks** — you target, the sim resolves.
- **Victory:** **town-hall destroyed = player eliminated** (generalizes the shipped "keep
  sacked = game over"). **Last player standing wins.** Default lobby mode.

## Decisions (grilled 2026-06-19)

- **Combat = launch-an-attack reusing the shipped raider/siege model.** Spend resources
  (and/or conscript pop) → army auto-paths to a targeted enemy building/town-hall →
  resolved by the existing deterministic siege math generalized to PvP.
- **NO RTS unit micro, NO commandable stacks.**
- **Victory = town-hall destroyed → player eliminated; last player standing wins.** Default
  lobby mode.
- **PvP combat resolution + army pathing must be server-authoritative + deterministic** —
  army paths via the single authoritative pathfinder (brief 31); resolution via seeded RNG
  only, no `Math.random`/`Date.now`.

## Acceptance

- A launch-attack command spends resources/conscripted pop and dispatches an army that
  auto-paths to a targeted enemy building/town-hall.
- Siege math resolves attacker army vs defender `defensiveStrength` deterministically (PvP
  generalization of the shipped model).
- Destroying a player's town hall eliminates them; last player standing wins.
- No unit micro / commandable stacks exist.
- **Determinism gate:** sim-touching (combat + pathing). Multi-seed `EXPORT=json` re-proof
  + phase4/siege tests — **ask before running**.
- `npm run typecheck` + targeted vitest green.

## Dependencies / sequence

- **Depends on:** [28](2026-06-19-citadel-28-playerstate-refactor.md) (A),
  [30](2026-06-19-citadel-30-territory-influence.md) (C),
  [31](2026-06-19-citadel-31-pathfinder-perf.md) (D).

## Open tuning (resolve in-brief)

Army cost curve; conscription→strength factor; whether armies path only through
own/unclaimed territory; contested-tile interaction with brief 30.
