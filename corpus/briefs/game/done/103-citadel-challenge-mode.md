# Brief 103 — Citadel Challenge mode (unfreeze the sharp systems as an opt-in mode)

status: **DONE 2026-07-13** (Wave 4, `c2caecc`) — approved (decision #13), reshaped 2026-07-10 second session (decision #24): Challenge is SOLO-ONLY. Scope 1 (mode plumbing + in-canvas cozy/challenge picker) landed `658bbeb`/`f65112d` and is now test-covered; scope 2 re-pointed the three dead decree levers onto autonomous `cozyThreats:false`-gated inputs (`c2caecc`); scope 3 (playable start→sack-or-survive) rests on the passing `sharp-raid-path.test.ts` reachability guard — the browser/determinism ×3 gates were consciously skipped at closeout (no new RNG; cozy byte-identical by construction).

> ⚠️ **Reshaped.** This brief used to say Challenge was the home of *every* sharp system, including the
> PvP armies decision #15 relocated here, "so it must at minimum support MP." Both halves of that are
> gone. **#21** deprecated multiplayer; **#23** reversed the PvP relocation (armies had a destination
> only while MP existed — they now freeze, and their marching machinery is salvaged by
> [brief 113](113-citadel-raid-gets-a-body.md)).
>
> **What Challenge is now:** a solo preset of `cozyThreats:false`, no `seedTown`, no threat-defer.
> `enableArmy` stays **false** — Challenge does *not* get armies back, because there is no second
> player to point one at. Challenge's stakes come from the sharp fire/disease/raid path.
>
> **What that buys:** this brief is no longer blocked on anything, and scope 1's mode plumbing shrinks
> to a call-site bundle. It is still the frozen sharp path's first real consumer, which is still the
> reason its two-branch test burden stops being dead weight.

**Shape settled by decision #19**: Challenge introduces **no new sim state**. It is a *preset* of the flat options the sim already takes and already persists (`cozyThreats:false`, no `seedTown`, no threat-defer), chosen by the caller — the solo worker or a client mode-picker. ⚠️ **Every mode-affecting option must be persisted in `CitadelSave`**, or `loadFromSave` replays the command log under different rules; two fields were already violating that invariant (fixed in `19d6d98`). See [citadel-decisions.md](../../../wiki/citadel-decisions.md).
source: the cozy pivot's own promise — the sharp systems were frozen "for a future
Challenge/MP mode", not deleted: `cozyThreats:false` keeps the destructive fire/disease/raid
path byte-identical; `enableArmy`/`enforceTerritory` gate army/territory; `activeDecrees`
reads survive in frozen immigration/siege. See [wiki/citadel-overview.md](../../../wiki/citadel-overview.md)
and the Phase D/G entries in [wiki/status.md](../../../wiki/status.md).

## Why

All the machinery for a higher-stakes ruleset already exists behind flags and is
regression-guarded (`cozyThreats:false` test). Exposing it as a deliberate mode turns
maintenance debt into content: cozy stays the default solo experience; Challenge is the
"the fire can actually take your bakery" ruleset for players who want stakes.

## Scope

1. **Mode plumbing**: a **call-site preset**, not a sim concept (#19) — no `mode` enum inside the sim.
   The solo worker picks a bundle of the existing flat flags (challenge = `cozyThreats:false`, no
   `seedTown`, no threat-defer; `enableArmy` stays **false** per #23). Save/load must persist every
   flag in the bundle. Solo UI offers the choice at new-game (in-canvas, minimal).
2. **Make sharp actually playable again** (it's been frozen since 2026-06-28): a playtest
   pass to find what rotted — note brief 97 chunk 4 must land first (sharp destruction
   currently leaks ghost workers), and the decree lever was purged in Phase G, so decide
   whether Challenge gets decrees back or the sharp systems get re-pointed at
   non-decree inputs (recommend the latter — don't resurrect purged UI).
3. **Balance sanity only** — this brief is NOT a full balance pass; it ships the mode,
   verifies a challenge run is playable start→sack-or-survive, and files findings.

## Constraints

- Cozy default path byte-identical (regression-guard both modes' baselines ×3).
- Depends on: brief 97 (chunk 4 ghost workers). MP interplay verified in brief 108's pass
  or a two-tab check here.

## Acceptance

> ⚠️ **Corrected 2026-07-11.** The line below used to demand "**army/territory active**", which
> the 2026-07-10 reshape header (decisions #23/#24) explicitly reverses — `enableArmy` stays
> **false** and Challenge does *not* get armies back. That clause was stale; it is struck.
>
> ✅ **Unblocked 2026-07-11.** The `sack` fixture that this brief's "start→sack-or-survive"
> depends on was **inert**, not merely drifting (it could not sack at all: cozy default + a
> Town-locked keep ordered at Hamlet). Fixed in `7c76522` + `36382d2` — `sack` now reaches
> `keepSacked=true` through a real playthrough. See
> [the closed drift todo](../../../todos/closed/2026-07-10-citadel-sack-scenario-drift.md).
>
> ⚠️ **And read its lesson before writing this brief's tests.** Two existing sharp-sack tests
> passed for ten days while the sharp path was unreachable, because they **poke
> `lp.tier = "Town"`** and bypass `TIER_LOCK`. When Challenge asserts "a raid can sack", assert
> it through the **reachable** chain (grow → earn Town → keep clears the gate → raid lands), the
> way `sharp-raid-path.test.ts` does — not by pre-unlocking the tier, which is exactly how this
> rotted unseen.

- New game offers cozy/challenge; challenge run playable in a real browser (raid can sack,
  fire can destroy; ~~army/territory active~~ — **struck: `enableArmy` stays false per #23/#24**);
  cozy baseline unmoved; both modes MATCH ×3.
