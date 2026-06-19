---
title: "Citadel — give the threat level a mechanical consequence (it's currently cosmetic)"
created: 2026-06-19
status: open
tags: [citadel, sim, gameplay, balance]
---

# Citadel — give the threat level a mechanical consequence

`threatLevel` is tracked, escalated, decayed, and shown in the event log + snapshot,
but it **drives nothing**. Raids spawn on a fixed schedule independent of it, and the
player has no reason to manage it. A surfaced number with no mechanic is noise.

## Context

- `threatLevel` is a `PlayerState` field
  ([sim-state.ts](../../games/citadel/sim-core/src/sim-state.ts)); raids bump it +15
  on spawn and −10 on repel, clamped 0-100
  ([raid-spawn.ts](../../games/citadel/sim-core/src/systems/raid-spawn.ts),
  [siege-resolution.ts:219](../../games/citadel/sim-core/src/systems/siege-resolution.ts#L219)).
- Raid arrival is on a fixed interval (≈8 days → 3-day floor) that does **not** read
  `threatLevel` — verify the spawn cadence in `raid-spawn.ts` and wire threat into it.

Make threat a lever the player feels. Options (pick one or combine):

- **Raid cadence** — higher threat shortens the interval to the next raid (a
  visible escalation the player races to defuse).
- **Decree gating** — conscription (and other emergency decrees) auto-unlock above a
  threat band, forcing the happiness-vs-safety trade earlier.
- **Defense pressure** — block declaring "peace"/down-tiering while threat is high,
  or give defensive buildings a small output/effectiveness bonus under threat.

Pairs with the raider-silhouette work in
[entity-silhouette-legibility](2026-06-19-citadel-entity-silhouette-legibility.md)
(so rising threat is legible on-screen) and the
[siege-variance-and-raid-counterplay](2026-06-19-citadel-siege-variance-and-raid-counterplay.md)
todo (scouting reveals what the threat level is warning about).

Sim-side, deterministic: any threat-driven randomness goes through `state.rng.fork`.
Verify with the fast 3-day/3-seed diff.

## Acceptance

- `threatLevel` measurably changes at least one of: raid cadence, decree
  availability, or defensive pressure — not just the event log.
- Determinism holds across seeds; a headless `SCENARIO=siege` run shows threat
  driving behavior.
