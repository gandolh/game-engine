---
title: "Citadel — villager entity count on the map must equal the population"
created: 2026-06-27
status: partial
tags: [citadel, sim, render, villagers, population, consistency]
---

> **➡️ Promoted 2026-07-03:** the two deferred halves (ambient-crowd decision + MP
> owner-filter) are now [brief 105](../briefs/game/todo/105-citadel-crowd-honesty-mp-owner-filter.md).

> **Partial — 2026-06-27.** Found and fixed the real on-map mismatch: **raid
> casualties decremented `p.population` WITHOUT despawning villager entities**
> ([siege-resolution.ts](../../games/citadel/sim-core/src/systems/siege-resolution.ts),
> the `p.population -= popLoss` after a sacking) — so after every raid the visible
> crowd exceeded the count. Extracted a single source of truth
> `removeOneVillager(state, p)` in [sim-state.ts](../../games/citadel/sim-core/src/sim-state.ts)
> (despawn highest-id owned villager + free its worker slot + decrement pop, in
> lockstep, deterministic) and routed all three loss paths through it — immigration
> (starvation/morale), disease deaths, and now raid casualties (previously the
> only one that leaked). Also fixed a pre-existing double-event on the morale path.
> New phase-4 invariant test asserts `ownedVillagers == population` **every tick**
> across a raid that inflicts casualties. 165 sim-core tests green; determinism
> preserved (despawn order is deterministic; phase-4 deep-equal snapshot test
> still passes). Commit pending. See [log.md](../log.md).
>
> **Still open (deferred):** the **ambient-crowd** layer
> ([ambient-crowd.ts](../../games/citadel/client/src/render/ambient-crowd.ts)) still
> draws extra background figures that can read as population — decide whether to
> cap to population, gate, or make them visually distinct. Also: the snapshot's
> `getVillagers()` emits **all** villagers regardless of `ownerId` while
> `population` is the local player's — equivalent in solo, but for MP the snapshot
> should owner-filter. Neither is the bug the user saw (that was the siege leak).

# Citadel — entities on the map should reflect population

## Problem

There appear to be **more villager entities drawn on the map than the player's
`population`** value. The two should be the same number: every person counted in
`population` is one villager entity, and there are no villager entities beyond the
population count. Today `spawnVillager` increments `p.population` and spawns an
entity together ([immigration.ts:205-271](../../games/citadel/sim-core/src/systems/immigration.ts#L205)),
but somewhere the two diverge — entities outlive their population decrement, or
ambient/extra entities are rendered on top of the real ones, so the on-screen
crowd doesn't match the HUD population.

Possible sources to check:
- **Starvation / morale departures** decrement `p.population`
  ([immigration.ts:228-294](../../games/citadel/sim-core/src/systems/immigration.ts#L228))
  — confirm the corresponding villager **entity is despawned** in the same path,
  not just the counter decremented (or vice versa).
- The **ambient crowd** render layer
  ([ambient-crowd.ts](../../games/citadel/client/src/render/ambient-crowd.ts)) draws
  extra background figures that are *not* real villagers — if these read as
  population to the player, that's the mismatch. Decide whether ambient figures
  should be capped/removed so the visible crowd == population, or made visually
  distinct enough that they don't read as counted villagers.
- Any place population and entity lifecycle are updated independently (immigration
  vs. spawn, disease deaths, game-over) — they must move together.

## Wanted

The number of villager **entities** on the map equals the player's **population**,
at all times and for every owner. No phantom villagers, no uncounted crowd reading
as population. When population goes up by one, exactly one entity appears; when it
drops by one, exactly one entity is removed.

## Approach

- Audit every read/write of `p.population` against the villager-entity
  spawn/despawn so the counter and the ECS entities are kept in lockstep (ideally
  derive one from the other, or assert `entityCount === population` in a debug
  check).
- Resolve the ambient-crowd question above explicitly (cap to population, gate on
  a flag, or make ambient figures clearly non-villager).
- Add a sim-side invariant test: after immigration / starvation / morale-departure
  / disease-death ticks, the count of owned villager entities equals
  `p.population` for each player.

## Notes / constraints

- This is mostly **sim-side bookkeeping** (population ↔ entity lifecycle), so keep
  it deterministic: no `Math.random`, route any choice through the seeded `Rng`.
  Re-prove with a multi-seed `EXPORT=json` diff if the spawn/despawn order changes.
- The ambient-crowd decision is **render-only** and doesn't touch determinism.
- Relates to [entity-movement-natural-feel](2026-06-27-citadel-entity-movement-natural-feel.md)
  (which already touches villager/raider render snapshots and ambient crowd).

## Acceptance

- On-screen villager entity count == HUD `population` for every owner, verified in
  `npm run citadel` across growth and decline (starvation/morale/disease).
- A sim test asserts `ownedVillagerEntities(p) === p.population` after each
  population-changing path.
- Ambient crowd no longer reads as extra population (capped, flagged, or visually
  distinct — decision recorded).
