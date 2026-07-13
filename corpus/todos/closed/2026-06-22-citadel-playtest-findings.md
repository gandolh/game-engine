---
title: "Citadel — playtest findings: growth death-spiral, dead service coverage, silent tier-lock cold-open"
created: 2026-06-22
status: closed
closed: 2026-07-11
tags: [citadel, sim, gameplay, balance, ux, playtest]
---

> **✅ CLOSED 2026-07-11.** The last open finding, **P3 disease counterplay**, shipped as
> [brief 102](../../briefs/game/done/102-citadel-disease-counterplay.md) (Wave 3,
> `c22145e`): well coverage now reduces outbreak onset, healer effects are legible in
> event copy and the inspect panel, all browser-verified. Every finding from this pass is
> now resolved. The 2026-07-11 playtest that closed it surfaced a NEW P1 — solo cozy play
> cannot reach Town tier — tracked separately in
> [2026-07-11-citadel-solo-town-tier-unreachable.md](../2026-07-11-citadel-solo-town-tier-unreachable.md).

> **Status 2026-06-22 (partial).** Resolved: **P0 immigration deadlock**, **P1
> grow death-spiral**, **P1-live silent placement reject**, **P2 tier-lock
> cold-open spam**. See the per-section notes below and the
> [log entry](../log.md). The actual root cause of the growth stall was deeper
> than this doc's diagnosis — output is **per-building** (a 2nd worker is a wasted
> mouth) and **services were staffed before the bread chain**; the fix was
> goods-before-services worker assignment + per-unstaffed-building founding +
> buffer-based immigration. `grow` now holds pop 10–11/12 through a full year;
> determinism re-proved across 3 seeds.
>
> **Update 2026-06-27.** **P2 service-coverage feedback is now RESOLVED** — the
> [coverage overlay](2026-06-22-citadel-catchment-coverage-overlay.md) (placement
> ring + `C` overlay + "covers 0 homes" toast) and the road
> [disconnected-building marker](closed/2026-06-27-citadel-road-feedback-connectivity-indicator.md)
> together make "I built X and nothing happened" legible (service reach AND road
> connectivity). Also shipped the OpenTTD two-way loop's downside
> ([stockpile pressure](2026-06-22-citadel-two-way-service-economy.md)). **Still
> open: P3 disease counterplay** (the only untouched finding — a healer exists but
> there's no proactive lever; left for a dedicated balance pass).
> **➡️ P3 promoted 2026-07-03** to [brief 102](../briefs/game/todo/102-citadel-disease-counterplay.md).

# Citadel — playtest findings

A playtest pass driving the headless runner (`npm run sim:citadel`, scenarios
`grow` and `siege`, 40–60 days, seed `0x1a2b3c4d`). These are reproducible from
the console output without a browser. A few are balance/scenario issues; a couple
are genuine "the player gets no feedback" UX holes. Prioritised; **verify each
against current code before acting** — line refs may have drifted.

> Scope note: started *headless*; **now extended with a live real-GPU run**
> (Playwright + system Chrome, WebGPU confirmed, 565 in-game days at 4× via the
> `window.__citadel.send` dev hook). The live run pinned down the root cause of
> the growth stall — see **P0** below, added 2026-06-22.

## P0 — immigration deadlock: population freezes at the founding size, forever (live-confirmed)

> **RESOLVED 2026-06-22.** The "fill open slots" direction below is *wrong* given
> the real production model (output is per-building, gated only on
> `workerCount > 0` — a 2nd slot is a wasted mouth). True cause: pure services
> (chapel/market/watchpost) were staffed *before* the bread chain. Fix:
> goods-before-services in `villager-system.ts` assignment + found one worker
> **per unstaffed building** (so a 2nd bakery gets staffed) + immigrate on a
> healthy bread buffer. `grow` now reaches Village by day 5 and holds pop 10–11/12
> through a full year. Determinism re-proved across 3 seeds.

The single most important finding. Live, a well-fed connected town **sat at pop 6
for 565 in-game days** — never grew, never shrank meaningfully, happiness pinned
at the base 40. This is not slow growth; it's a hard equilibrium the town cannot
escape. Root cause is two coupled rules in
[immigration.ts](../../games/citadel/sim-core/src/systems/immigration.ts):

1. **Founders stop once each building *type* has one worker, not when slots are
   full.** `needsFounder` is gated on `countUnstaffedProductionTypes`
   ([immigration.ts:129-133](../../games/citadel/sim-core/src/systems/immigration.ts#L129),
   [:239](../../games/citadel/sim-core/src/systems/immigration.ts#L239)) — a type
   counts as "staffed" the moment *any one* building of that type has a worker. So
   with farm(2 slots)/mill/bakery/woodcutter present, founding delivers ~5–6
   villagers (one per type) and **stops**, leaving every second farm slot, second
   mill, etc. permanently empty.
2. **Post-founding immigration requires a strictly-positive daily bread surplus.**
   `else if (p.foodSurplus > 0 && population < popCap)` then roll
   `rng < happinessFactor` ([immigration.ts:136-141](../../games/citadel/sim-core/src/systems/immigration.ts#L136)).
   But a *half-staffed* food chain produces almost exactly enough bread to feed
   the current population → `foodSurplus` hovers at **0** (observed: bread deltas
   were `+0` almost every day) → the immigration roll almost never gets a chance
   to fire. The `happinessFactor` (0.7–1.0) is generous and **not** the binding
   constraint — the surplus gate is.

Net: founders fill one slot per type → economy runs at ~half capacity →
break-even bread → no surplus → no immigrants → no workers to fill the empty slots
that would create a surplus. **Chicken-and-egg.** More farms/houses don't help
(no workers to staff them); higher happiness doesn't help (surplus is the gate).

**Consequence for this task — "unlock and upgrade all buildings is currently
unreachable via normal play."** Village tier is easy (buildings-path, pop ≥ 5),
which unlocks sawmill/smith/quarry/tower/wall/gate. But **Town** needs pop ≥ 10
(even the buildings-path requires `minPopForBuildings: 10`,
[tiers.ts:97](../../games/citadel/sim-core/src/systems/tiers.ts#L97)) and pop is
frozen at ~6 — so keep/garrison never unlock, and L3 upgrades (Town-gated) are
impossible. On top of that, **zero upgrades of any level happened** because L2
needs planks+stone+tools that the worker-starved refining chain can't produce.
The progression ladder is gated behind a population mechanic that can't advance.

Fix direction (pick a coherent set; all sim-side, re-prove determinism across 3
seeds):
- Let founding fill **open slots**, not one-per-type (keep arriving while
  `openSlots > 0` within the window), so the economy reaches real throughput.
- And/or decouple growth from a strictly-positive *daily* surplus — e.g. allow a
  slow immigration trickle when the **bread stockpile** is healthy (a buffer),
  not only when today's production beat consumption.
- And/or make the founding food chain net-positive at founding pop so a surplus
  actually accrues.

**Acceptance:** a fed, connected, reasonably-happy town grows past pop 10 and on
toward Town tier without manual intervention; a player can plausibly reach Town
(and thus keep/garrison + L3 upgrades) by playing well. Determinism holds.

## P1 (live) — placement silently fails with no feedback

> **RESOLVED 2026-06-22.** `placeOne` now returns a reason code; a single building
> emits one descriptive event and a road/wall drag coalesces per-tile rejections
> (see the tier-lock P2 section). Coverage-feedback (P2 below) is still open.

Driving placement live, buildings dropped onto tiles already covered by a road
carpet (or another building) were **silently rejected** — no toast, no ghost-red,
nothing; they just don't appear. (`placeOne` returns `false` with no event on the
occupancy/terrain reject path,
[sim-bootstrap.ts:331](../../games/citadel/sim-core/src/sim-bootstrap.ts#L331).)
A player carpeting roads and then placing structures hits this constantly and gets
no explanation. Pair with the zero-coverage-service feedback in P2 below: **every
failed/ineffective placement should say why.**

> Scope note: render/input polish (toast pacing, ghost feel) still merits a
> dedicated live pass; the items below were first seen headless and re-confirmed
> live where noted.

## P1 — the "grow" scenario does not grow; it death-spirals

> **RESOLVED 2026-06-22.** Same fix as P0 (goods-first worker assignment was the
> binding constraint — services were starving the bread chain of labour). `grow`
> now reaches and *holds* pop ≥ 10 through a full 80-day year on the default seed,
> banks a bread surplus, and recovers from winter + disease shocks.

The default `grow` scenario is *documented* to "grow past 8+ by summer/autumn"
([tools/citadel-sim/src/index.ts:170](../../tools/citadel-sim/src/index.ts#L170)).
Observed: pop is pinned at **6/12** for ~40 days, then **collapses to 2/12** by
day 60 (settlement falls Village → Hamlet). It never reaches 8. The town is in a
slow-bleed equilibrium it cannot climb out of.

Root cause is a coupled loop, not one number:
- **Happiness is hard-capped near 50** because `faith`/`safety` coverage sit at
  **0%** the whole game (see P2) — `_updateHappiness` is base 40 + up to 20 each
  for faith/safety/goods ([needs-happiness.ts:101-118](../../games/citadel/sim-core/src/systems/needs-happiness.ts#L101)).
  With two needs dead, the ceiling is ~70 and the steady state is ~50.
- **Immigration is too weak to outrun attrition.** Recurring disease (P3) plus
  winter bread deficits trim 1 villager every several days; immigration replaces
  them about as fast, so pop oscillates and trends *down* once a bad winter hits.

Fixes to weigh (pick the smallest set that makes a well-built town climb):
- Re-tune immigration so a fed, road-connected, happy town grows steadily (the
  loop should be winnable, not a knife-edge). Verify against
  [immigration.ts](../../games/citadel/sim-core/src/systems/immigration.ts).
- And/or soften winter grain halt so an autumn surplus actually carries the town.
- Confirm the `grow` scenario itself is a fair exemplar after the tune (it places
  services out of range — see P2 — so it under-sells the game even when the sim
  is healthy).

**Acceptance:** the default `grow` run reaches and *holds* pop ≥ 8 through a full
year on the default seed, and recovers from a single bad winter rather than
spiralling. Determinism holds across 3 seeds.

## P2 — service buildings can cover *zero* houses with no feedback ("I built a chapel and nothing happened")

`faith`/`safety`/`goods` coverage is purely distance-based (Manhattan ≤ radius,
radius 8 for chapel/watchpost/market —
[needs-happiness.ts:76-96](../../games/citadel/sim-core/src/systems/needs-happiness.ts#L76),
[building.ts:97](../../games/citadel/sim-core/src/entities/building.ts#L97)). In
the `grow` scenario the chapel/market/watchpost are placed ~11 tiles from the
houses, so coverage is **0% forever** despite the buildings existing, being
connected, and being staffed. A player gets *no signal* that the building is
useless where they put it — the only tell is a HUD percentage that never moves.

This is the single biggest "feels broken" moment for a new player. Options:
- **Placement feedback** — when a service is selected, show its radius ring (the
  ghost already exists); after placing, toast "chapel covers 0 houses — move it
  closer" when `housesInRadius === 0`.
- **Minimap/overlay** — a faint coverage tint per need so gaps are visible.
- Spacing tension (fire pushes buildings ≥5 apart; service radius 8 + connectivity
  pull them together) is **intended design** — confirmed 2026-06-22, see the design
  note in [citadel-overview.md](../wiki/citadel-overview.md). So this is about
  *legibility*, not re-tuning: surface the coverage gap, don't remove the tradeoff.

**Acceptance:** placing a service that covers no houses produces a visible cue;
the `grow` scenario (or its successor) actually lands services in range so faith
& safety read > 0%.

## P3 — recurring single-villager disease with no counterplay in a sparse town

Even in non-crowded towns, a 1-villager outbreak recurs every ~10–15 days
(observed days 15, 26, 50 in `grow`; days 16, 23 in `siege`), each killing ~1
pop. The player's only mitigation is a Healer, but in a small early town the
onset feels like unavoidable random attrition rather than a managed risk —
it's a steady tax that helps drive the P1 spiral. Verify onset math in
[disease-system.ts](../../games/citadel/sim-core/src/systems/disease-system.ts)
and either (a) gate onset on a higher crowding/unhappiness floor so a healthy
sparse town is safe, or (b) make the risk legible and pre-emptively counterable
(a Healer built *before* an outbreak should visibly lower the standing risk, not
just mortality once sick). Pairs with the
[threat-mechanical-consequence](2026-06-19-citadel-threat-mechanical-consequence.md)
theme: hazards should be levers the player manages, not dice.

**Acceptance:** a fed, reasonably-spaced, Healer-served town does not lose pop to
disease on a loop; outbreak risk is visible before it fires.

## P2 — tier-locked cold-open dumps ~20 rejection events at day 0 (siege)

> **RESOLVED 2026-06-22 (sim side).** Road/wall drags now coalesce per-tile
> rejections into one summary event per reason ("12 walls need Village tier —
> unlock it first"); verified on `siege` day 0. The *toolbar* grey-out for locked
> tools is a client follow-up, not yet done.

Starting `siege`, day 0 logs a wall of `"A wall requires Village tier"` /
`"A keep requires Town tier"` rejections (one per locked tile) — the player's
entire defensive plan silently fails and the event log is unreadable. This is the
"founding-window-gated bootstrap" the wiki warns about, but the *UX* is the
problem: 20 near-identical toasts. Coalesce locked-placement rejections ("12
walls need Village tier — unlock it first") and/or grey-out/te-tooltip locked
toolbar buttons so the player never fires the command. Verify the lock path in
[placeOne / TIER_LOCK](../../games/citadel/sim-core/src/sim-bootstrap.ts#L286).

**Acceptance:** attempting locked placements yields at most one coalesced message
per type per action; locked tools are visibly locked in the toolbar.

## Follow-up — live GPU playtest

The above is headless. A real-GPU mouse playtest (`npm run citadel`, the
Playwright + system-Chrome path noted in the 2026-06-22 log entry) should still
be run to cover: ghost/placement feel, road-drag ergonomics (see the
[road-routing](2026-06-22-citadel-road-routing-around-buildings.md) todo),
minimap legibility (see the
[minimap-rotate](2026-06-22-citadel-minimap-rotate-viewport-rectangle.md) todo),
toast pacing, and whether the tier/coverage feedback above actually reads on
screen.
