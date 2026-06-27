---
title: "Citadel — fires ignite during boot / on a player-less cluster, before the player can react"
created: 2026-06-27
status: done
resolved: 2026-06-27
tags: [citadel, sim, gameplay, fire, hazard, boot, live-finding, minor]
---

> **Done 2026-06-27.** Took the **temporal grace** option (not the population
> gate — the dense-town density mechanic must still burn an unpopulated built
> district). `FireSystem` records the first observed day each player owns any
> building and suppresses fresh ignition for `floor(daysPerYear/4)+2` days after
> it (mirrors the immigration founding window). Spread is unaffected — a fire
> already underway still propagates. Live-confirmed: a dense cluster built at
> day 11 stays fire-free through day ~18, ignites day 24. Regression test
> (phase45) asserts no ignition during grace + fire after, and fails without the
> fix. sim-core 159/159; determinism identical. Commit `573d9c8`.
> See [log.md](../log.md). Pairs with the cold-start P0
> [founding-window-expires-before-boot](closed/2026-06-27-citadel-founding-window-expires-before-boot.md).

# Citadel — fire ignites on an unattended cluster before the player has control

## Severity: P2 — minor, partly by-design; compounds the cold-start problem

Live finding (Playwright + real-GPU run, 2026-06-27). While testing the cold
start, a freshly-placed wooden cluster **caught fire at ~Day 18 and again ~Day 22**
("a house burned down") with **population 0** and a well present. The settlement
was destroyed before any villager ever arrived — see the related cold-start P0
[founding-window-expires-before-boot](2026-06-27-citadel-founding-window-expires-before-boot.md).

## What's actually happening (verified against code)

Ignition in [fire-system.ts:_checkIgnition](../../games/citadel/sim-core/src/systems/fire-system.ts#L180)
is a pure **density** function, independent of population or activity:

- Only wooden buildings ([WOODEN_TYPES](../../games/citadel/sim-core/src/systems/fire-system.ts#L28)).
- Needs `nearbyWooden >= 3` within radius 4
  ([:194-196](../../games/citadel/sim-core/src/systems/fire-system.ts#L194));
  `chance = min(0.70, (nearbyWooden-2)*0.20)`
  ([:197-198](../../games/citadel/sim-core/src/systems/fire-system.ts#L197)).
- A nearby **well** multiplies chance ×0.2
  ([:200](../../games/citadel/sim-core/src/systems/fire-system.ts#L200)) — mitigates
  but does not eliminate.

So a dense wooden cluster burns **whether or not anyone lives there**. The
docstring says this is intentional ("fire rewards deliberate layout: spacing,
firebreaks, wells"). The *spacing/firebreak* lesson is fine — the surprising part
is purely the **timing**: fire rolls every day from day 0, including the boot
window before the player can place a well, space things out, or even see the map.

## The real issue: it fires before the player has agency

Combined with the cold-start boot delay (sim is already ~Day 15 before the client
is interactive), the very first thing a player can witness is **their starter
cluster already on fire**, with no chance to have mitigated it. That's a feel-bad,
not a fair difficulty.

## Options (decide in the brief; small)

- **Grace period**: suppress (or heavily damp) ignition for the first N sim-days /
  until the player's first command — pairs naturally with whatever fix the
  cold-start P0 lands (e.g. boot paused / anchor start to first command).
- **Gate ignition on settlement activity** (e.g. require ≥1 villager, or
  population > 0) so a dead/empty cluster doesn't spontaneously combust — arguably
  more intuitive (hearth fires need people).
- Leave the density model as-is (it's the intended teaching tool) and **only**
  remove the pre-agency window — likely the minimal, least-balance-disturbing fix.

## Notes / constraints

- Sim + determinism change — re-prove with multi-seed `EXPORT=json` +
  `CHECK_DETERMINISM=1`. Keep the fire RNG draw order stable (solo = player 0 =
  legacy stream, [fire-system.ts:64](../../games/citadel/sim-core/src/systems/fire-system.ts#L64)).
- Confirm the headless `siege`/`grow` scenarios still behave (fire is part of
  their balance), and that any grace period doesn't neuter the siege→fire
  interlock ([igniteBuildingById](../../games/citadel/sim-core/src/systems/fire-system.ts#L326)).

## Acceptance

- A new player is not greeted by a starter settlement that ignited before they had
  any ability to mitigate it.
- Fire still rewards spacing/wells/firebreaks in mid-game (density model intact).
- Determinism re-proved; `grow`/`siege` scenarios unaffected.
