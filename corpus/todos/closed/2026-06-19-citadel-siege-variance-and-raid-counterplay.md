---
title: "Citadel — make the raid/siege loop interactive (siege variance + counterplay + garrison purpose)"
created: 2026-06-19
status: done
tags: [citadel, sim, gameplay, combat]
---

# Citadel — make the raid/siege loop interactive

> **DONE (2026-06-26).** Siege resolves via seeded probability bands (consumes the
> fork → also fixes citadel-38 P3#14) + per-raider morale that decays when the player
> repairs defenses mid-march. Scout (watchpost/garrison) reveals incoming strength ~2
> days early; garrison interceptors shave 25% off covered raiders. Garrison now has
> pre-raid value (deters raid cadence + safety radius). Deterministic, reproducible
> across seeds. See log.md 2026-06-26.

The raid → siege loop is currently "build walls, then wait and pray." Three coupled
gaps remove player agency from the game's main tension source. Address them together
since they share the same systems.

## Context

1. **Siege outcome is a deterministic threshold with zero variance.**
   [siege-resolution.ts:78-82](../../games/citadel/sim-core/src/systems/siege-resolution.ts#L78)
   — `resolveSiege(raidStrength, defenseStrength, _rng)` ignores its RNG fork
   (param is literally `_rng`) and returns `repelled` if `defense ≥ strength*1.5`,
   `damage` if `≥ strength*0.5`, else `sacked`. The caller
   ([siege-resolution.ts:211](../../games/citadel/sim-core/src/systems/siege-resolution.ts#L211))
   *passes* `state.rng.fork(\`siege-${raider.id}\`)` but it's discarded. So a player
   at exactly the threshold gets a guaranteed fixed result — no clutch defenses, no
   drama. **Fix:** use the seeded fork to turn the thresholds into probability bands
   (e.g. high-defense → 90% repel, mid → mostly damage, low → mostly sacked), and/or
   add a per-raider "siege morale" that decays if the player repairs defenses
   mid-siege (represents desertion). Stays fully deterministic (seeded).

2. **No counterplay during the raider march.**
   Raiders spawn at the map edge and crawl (`raider-movement.ts`, ~1 tile / 3 ticks)
   and only resolve on contact with walls/towers/keep
   ([siege-resolution.ts:201-215](../../games/citadel/sim-core/src/systems/siege-resolution.ts#L201)).
   Nothing the player does during the march matters. **Fix:** a "scout" event that
   reveals incoming raider strength a couple days early (legible warning), and/or let
   garrison buildings deploy interceptors that shave raider strength if their path is
   covered.

3. **Garrison is a dead-end building.** It houses conscripted villagers but only
   matters *during* an active raid, so it can be snap-placed on raid day with no
   pre-positioning value. **Fix:** give it continuous value — e.g. an active garrison
   reduces raid-spawn frequency (patrols deter), or extends a safety radius that
   lowers the conscription happiness penalty for nearby houses — so siting it early
   is a real decision.

These deepen the core loop and reward planning over reaction. All sim-side →
**must stay deterministic**: route every random choice through `state.rng.fork(...)`,
and verify with the fast 3-day/3-seed `EXPORT=json` diff plus `CHECK_DETERMINISM`.

## Acceptance

- Siege outcomes use the seeded RNG fork (real variance), not a bare threshold;
  determinism holds across seeds.
- The player has at least one meaningful action during a raid (scouting and/or
  interception) that changes outcomes.
- Garrison has a reason to exist before a raid lands.
