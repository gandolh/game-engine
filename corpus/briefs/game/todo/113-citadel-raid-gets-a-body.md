# Brief 113 — The cozy raid gets a body (rehome the army's marching machinery)

status: todo — **design settled, execution deferred.** Decision **#23** (2026-07-10, second session).
source: the 2026-07-10 second grilling session. Reverses decision **#15**, whose "relocate lethal PvP
into Challenge mode" had a destination only while multiplayer existed. **#21** deprecated MP.

## Why

Two systems in `@citadel/sim-core` attack the player, and each has exactly what the other lacks.

**Raids have a mechanic and no body.** `applyRaidDamage`
([siege-resolution.ts:200](../../../../games/citadel/sim-core/src/systems/siege-resolution.ts)) is an
abstract `raidStrength` number applied at the keep. Under cozy defaults (Phase D) raiders pilfer
stockpile goods and leave. `pickEdgeSpawn` picks a map-edge tile — and then nothing walks from it.
The player experiences a raid as a toast and a dent in the stockpile.

**Armies have a body and no mechanic.** `ArmyState`
([sim-state.ts:87](../../../../games/citadel/sim-core/src/sim-state.ts)) carries `x, y, tileX, tileY`
— a unit that *marches* — and `ArmySystem` (150 lines) advances it and resolves it on arrival. But it
is PvP down to its fields: `attackerId` is *a player who launched it*, `targetPlayerId` is *the owner
of a targeted building*, and `findTargetBuilding` filters on `ownerId`. With MP deprecated there is no
attacker. With the cozy contract in force (#9: nothing you built is taken from you) there is no
building to destroy.

So: **give the raid the army's body.** Raiders you watch cross the map, arrive, take some goods, and
leave. No new mechanic — the existing cozy raid, made visible. This is the diegetic principle (#8,
#10) applied to the one threat the player currently cannot see coming.

## Grounding correction (controller, 2026-07-11 — read before building)

**The premise below is stale: the raid already has a body, end to end.** `RaidSpawnSystem`
spawns a positioned `RaiderState` at `pickEdgeSpawn`'s tile with a BFS path;
`RaiderMovementSystem` (systems/raider-movement.ts, `af31818`, 2026-06-26) marches it one tile
per 3 ticks; garrison interception is **already spatial** (sortie when the raider's tile enters
the garrison's service radius); the snapshot carries `raiders: RaiderSnapshot[]`; the client
renders them through `entity-interp.ts` with the villagers' interpolation. Scopes 2, 3 and 5
are **built**; the `ArmySystem` salvage is **moot** (`ArmyState` stays frozen, untouched).

**The one real gap vs. Acceptance:** on the cozy path a raider that reaches the keep is
resolved and **spliced out the same tick** (siege-resolution.ts `applyCozyPilfer` branch) — it
pilfers and *vanishes* instead of departing. **Remaining scope = the departure walk:**
on cozy arrival, apply pilfer/happiness/threat/events **exactly as today** (same tick, same RNG
forks, same event strings — the event stream must not move), then mark the raider `leaving`
instead of splicing; it retraces its path toward the edge and is removed when the path is
exhausted. While `leaving`: no garrison interception (don't shave a departing raid), no
target-recompute, no re-arrival. The sharp (`cozy === false`) branch is untouched —
resolve-and-splice as today, `sack` stdout byte-identical. No new RNG anywhere; no new events
(a despawn toast would move the event stream for no gameplay reason). Plus the browser
playtest the Acceptance always demanded.

## Scope

1. ✅ **DONE — landed early in [brief 110](../done/110-citadel-client-world-size.md) (`0fd66c0`).**
   `enableArmy` now defaults **`false`**, and the `launchAttack` handler is gated on it in the *same*
   change. `ArmySystem` and the handler stay in the tree, unregistered and unreached.

   The trap was **real and confirmed empirically**: with the flag flipped and the handler ungated, 20
   `launchAttack` commands leave `state.armies.length === 20` and the tools debited — the army is never
   resolved and never removed, because `enableArmy:false` only unregisters the *system*. The rejection
   is explicit (a `pushEvent`), the way peer-sent `setActivePlayer` is rejected (citadel-38 P0#3).
   `army.test.ts` now passes `enableArmy: true` explicitly, and gained a byte-identical proof that
   freezing `ArmySystem` does not move a one-player sim. **Do not redo this step.**

2. **A raider entity with a position.** Introduce a PvE raid body — either a new `RaiderState`, or
   `ArmyState` with the PvP fields dropped. Decide at session start; the fields to lose are
   `attackerId` and `targetPlayerId`, and the targeting must become "the keep" (`keepPosition`) rather
   than "a rival's building". Reuse `ArmySystem`'s tile-stepping and arrival resolution — that is the
   asset this brief exists to salvage.

3. **Wire it to the existing raid schedule.** `pickEdgeSpawn` already chooses the entry tile.
   The raid's existing strength/probability bands, morale, and the scout/garrison-interceptor
   counterplay (all shipped 2026-06-26) stay authoritative — the body must not become a *second*
   source of truth for whether a raid lands or how hard.

4. **Resolution stays cozy.** On arrival: pilfer per `applyRaidDamage`'s existing rules (defense
   shrinks the theft), then **leave** — the raiders walk back off the map edge. Never sack, never
   `gameOver`, never destroy. Under `cozyThreats:false` (Challenge, #24) the sharp resolution stays
   reachable, byte-identical.

5. **Render.** Raiders draw as sprites on the iso entity layer with the interpolation the villagers
   already use ([entity-interp.ts](../../../../games/citadel/client/src/render/entity-interp.ts),
   incl. brief 104's corner-cutting spline). Snapshot carries their positions. An approaching raid
   should be readable **before** it arrives — that is the entire point.

## Constraints

> ⚠️ **Read this first (added 2026-07-11).** Scope 4 says the sharp resolution must stay
> "**reachable, byte-identical**" under `cozyThreats:false`. Until 2026-07-11 that criterion was
> **vacuously satisfiable**: the sharp raid path was *unreachable*, and the only fixture that
> exercised it (`SCENARIO=sack`) had been inert since the cozy pivot — while **two sharp-sack
> tests passed the whole time**, because they poke `lp.tier = "Town"` and bypass `TIER_LOCK`.
> Fixed in `7c76522` + `36382d2`; see
> [the closed drift todo](../../../todos/closed/2026-07-10-citadel-sack-scenario-drift.md).
>
> **Consequences for this brief:** (a) `SCENARIO=sack` and `sharp-raid-path.test.ts` are now
> your regression guard — a raid body that breaks reachability will be *caught*, which was not
> true before; (b) note that **raiders march ~6.7 tiles/day from a map edge on the 192×192 world
> (~15 days in transit)** — that long approach is precisely what makes this brief's "an
> approaching raid should be readable *before* it arrives" worth doing, and it is also why `sack`
> now needs 70 days; (c) when you assert the sharp path still works, assert it through the
> **reachable** chain, never by pre-unlocking the tier.

- **Cozy contract holds.** Nothing you built is taken from you (#9). Raiders take goods, never
  buildings, never lives.
- **Determinism**: all randomness via `state.rng.fork(label)`. A new fork label, so existing channels
  are undisturbed — but the raid schedule itself must not change, or the baseline moves for no reason.
- ⚠️ Baseline moves only if the raid *schedule or strength* changes. If the body is purely additive
  (same theft, same days, now visible), aim for **byte-identical** aggregate sim output and prove it.

## Acceptance

- A cozy raid is visible as it crosses the map, arrives at the keep, pilfers, and departs.
- No building is destroyed and `gameOver` is never set on the cozy path — the existing cozy-contract
  test still holds, extended to cover the raid body.
- `enableArmy` defaults `false`; a `launchAttack` command is **rejected**, not silently queued;
  `state.armies` never populates on the cozy path. `army.test.ts` passes with explicit `enableArmy:true`.
- Determinism MATCH ×3. Aggregate output byte-identical to pre-change unless the schedule moved —
  and if it moved, say why in the closeout.
- `npm run typecheck` + `npm run test` green; browser-verified via `playtest-citadel` (a raid must be
  *seen*, which is not a claim unit tests can make).

## Notes

- Sequence **after** [110](../done/110-citadel-client-world-size.md). On a 192×192 world (#22) a raider's walk
  from a map edge is long enough to be genuinely readable, which is what makes this brief worth doing;
  on 96×96 it would arrive almost immediately.
- The scout/garrison-interceptor counterplay shipped 2026-06-26 currently intercepts an *abstraction*.
  Once raiders have positions, interception becomes spatial — check whether that is a free upgrade or
  a behaviour change before assuming.
- [Brief 103](103-citadel-challenge-mode.md) (Challenge, solo-only per #24) is where the *sharp*
  resolution lives. This brief must not delete it.
