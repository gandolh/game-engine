# Brief 99 — P2 debt cleanup batch (review findings 28–35)

status: **DONE 2026-07-11.** Commits `f244bea`/`98839a6` (the wave), `f260a7e` (test-probe fix), `7da72da` (maxDays).

> **Closeout 2026-07-11.** Dispatched as 5 chunks on disjoint file lanes (4 junior/Sonnet + 1
> senior/opus on the rng+auction lane, which was promoted because the determinism gate cannot
> tell a *correct* rng change from a *wrong-but-still-deterministic* one).
>
> - **28 — `debitCrop`.** Centralized in `economy/helpers.ts`; drain order silver→normal→gold
>   with a `preferQuality` override (shopkeeper sells gold-first, as before). `moveNormalQuality`
>   was **deleted** — it only ever touched the `normal` tier regardless of what the giver held,
>   which was the phantom-tier bug itself. After the change, **zero** `inventory.crops[…] -=`
>   sites remain outside the helper. ⚠️ baseline moved.
> - **29 — harbor `deliveryDay`.** `ticksPerDay` injected (FestivalSystem's pattern); no longer
>   hardcoded `tick/20`.
> - **30 — dead scaffolding: DELETED** (decided: delete, don't wire). The `deliver-contract`
>   paid no-op intent + its 3-AP row are gone, and the whole CNP contract-net
>   (`agents/cnp-coordinator.ts`, `agents/cnp-registry.ts`, `protocols/cnp.ts`) is gone with it.
> - **31 — rng/lifecycle hygiene.** ShopSlateSystem now draws from a named `fork("shop-slate")`
>   instead of the raw top-level stream (the reorder-fragility fix). The auction takes the
>   **runner-up ladder, not escrow** — settlement awards to the highest bidder who can actually
>   pay, because escrowing at bid time would have to reach into farmer inventory on every bid
>   *and* duplicate the shopkeeper's gold accounting, racing its own debit. The festival tie-break
>   now **spends** the rng draw it was already taking (uniform pick among tied leaders) instead of
>   discarding it — same number of draws, but the low-id bias is gone. `EventFeedSystem.seen` and
>   `settledAuctions` are bounded. Dead `hasGoods` ternary removed. ⚠️ baseline moved.
> - **32 — snapshot module state.** `defaultSpriteState` singleton dropped (fresh state per call);
>   `buildEvents` returns a fresh array.
> - **33/34 — Citadel.** ProductionSystem's O(villagers × buildings) per-tick scan replaced with
>   one tile→building map per tick; FireSystem's firebreak lists precomputed once/day.
>   `extendTrail` incremental; `noDoor` contract made truthful; duplicate `device.lost` handler
>   collapsed. **Byte-identical** — proven against the pre-wave commit in a throwaway worktree.
> - **`maxDays` (#18) — deleted.** A *required* option no system read. `loadFromSave` computed its
>   own purely to pass through; deleted with it. Never in `CitadelSave`, so no save-format change.
>   The headless tool's `MAX_DAYS` env knob is a separate thing and still bounds the run.
> - **35 — excluded**, as the brief said: it belonged to [brief 110](110-citadel-client-world-size.md).
>
> **The Farm baseline moved, and it explains itself** (40d, seed `0xc0ffee`): unsold crops
> **13,404 → 9,037** while gold **21,475 → 19,687**. More crops selling for *less* money is
> exactly what item 28 predicted — phantom quality tiers had been inflating sale prices, so honest
> accounting means higher volume at correctly lower prices. Weather flips on day 1, the signature
> of the shop-slate fork no longer consuming draws from the shared stream.
>
> **One adjudication:** the wave's single failing test was item 32's own, and the *test* was wrong,
> not the fix — it probed `lastFacing`, which `resolveFacing` only writes when a farmer is actually
> *moving*, so an empty map a few ticks into a fresh sim is correct. Repointed at `lastIntention`
> (recorded for every AI farmer on first sight), which witnesses the same thing without depending
> on movement.
>
> **Gates:** typecheck 0; farm sim-core 829/829, citadel sim-core 267, citadel client 471, engine
> core 184, farm client 196, farm server 31, citadel server 10. Farm determinism **MATCH ×3**
> (baseline moved by design); Citadel **MATCH ×3 + byte-identical**.

status: todo
source: [2026-07-02 review findings items 28–35](../../../todos/2026-07-02-full-repo-review-findings.md) — the file:line detail lives there; verify each against current code first (brief 97's wave may have shifted lines).

One mechanical-cleanup wave; suitable for `plan-split-dispatch` with mostly junior chunks.
Group by package:

## Farm sim-core
- **Crop-quality bookkeeping drift** (item 28): `moveNormalQuality` + mill processing
  decrement `crops` but not `cropQuality` → phantom quality tiers (festival wins, sale
  mispricing). Centralize a `debitCrop(inventory, crop, qty)` and route all debits through
  it. ⚠️ can move baseline.
- **Harbor `deliveryDay = tick/20`** (item 29): inject `ticksPerDay` like FestivalSystem.
- **Dead scaffolding** (item 30): `deliver-contract` paid no-op intent (empty handler, 3 AP)
  — remove the AP row + intent or implement; CNP contract-net (module-global registry
  survives `bootstrapSim`, tasks never reach `completed`) — delete or finish; decide once.
- **RNG/lifecycle hygiene** (item 31): ShopSlateSystem forks `"shop-slate"` instead of the
  raw rng (⚠️ baseline moves); auction settlement escrows at bid or falls back to runner-up
  instead of retrying forever; festival tie-break either uses its drawn rng or stops drawing
  it (⚠️ baseline); evict `EventFeedSystem.seen` + `settledAuctions`; fix the dead
  `hasGoods` ternary in `watering/harbor.ts:107`.
- **Snapshot module state** (item 32): `buildEvents` shared scratch array → fresh/pooled
  per-call; `defaultSpriteState` singleton → per-run construction (test hygiene).

## Citadel
- **ProductionSystem O(villagers × buildings) per tick** (item 33): build one
  `tileToBuildingId` map per tick (pattern in sim-bootstrap's `getBuildings`); precompute
  FireSystem's daily burning/wooden lists + firebreak lookup.
- **Client niggles** (item 34): `extendTrail` incremental Set; `boxBuilding` `noDoor`
  contract (implement the option or fix the stale doc); collapse duplicate `device.lost`
  handlers.
- **MP iso render window** (item 35) — EXCLUDED here. The [brief 108](../done/108-citadel-live-mp-verification.md)
  live pass showed it is latent behind the client's hardcoded 96×96 world; it belongs to
  [brief 110](110-citadel-client-world-size.md).
- **Delete `maxDays`** (added 2026-07-10, decision **#18**): a *required* `CitadelSimOptions` field
  that **no system reads** — every caller passes it, nothing consumes it, and an MP room happily runs
  past day 200. It reads as a run-length bound and bounds nothing. Remove the field and every call
  site's argument (mechanical; touches many test files). Do **not** wire it up — MP is endless by
  decision #15. Note `loadFromSave` *computes* a `maxDays` of its own to pass through; check that
  path before deleting.

## Gates
Typecheck + tests green; Farm determinism MATCH ×3 (note which items moved the baseline);
Citadel determinism MATCH ×3; item 28/31 changes need red-before-fix tests.
