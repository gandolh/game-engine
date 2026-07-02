---
title: "Citadel cozy-pivot playtest — Phase E villager mood (LIVE-VERIFIED) + Phase F motivation (mechanism verified) + A–I cozy-visual eyeball + a toast-copy UX finding"
created: 2026-07-01
status: done
tags: [citadel, playtest, cozy-pivot, phase-e, phase-f, ux]
---

> **UPDATE 2026-07-01 (follow-up pass):** P1 SHIPPED — cozy-path threat toast copy re-worded
> (fire/disease/immigration event strings now branch on `cozy`; sharp wording kept verbatim
> under `cozyThreats:false`; determinism unmoved — per-day numeric state byte-identical vs
> baseline, only event copy differs by design). P2 SPLIT: the **instrumentation** half is
> DONE (`window.__citadel.snapshot()` exposes the live `RenderSnapshot`; `play.mjs` now reads
> game state from it — `timeline[].src === "snapshot"`, so `happy/pop/covered` are live, not
> the stale DOM null — and tracks the `allHomesCovered` false→true edge). The **placement**
> half is now ALSO DONE: the driver's plan is seed-aware (reserves the seeded road spine +
> a coverage-aware ring placer), and a live run holds `allHomesCovered:true` for all 49/49 ticks
> with happy 91–99. Phase F is placement-verified live; only the sub-second `false→true` edge
> isn't harness-observable (coverage is reached during boot — a sampling race, not a defect; the
> edge + seeded-silent behavior are unit-tested in main.ts). **This todo is now DONE.** See the
> P2 update below and [log 2026-07-01](../log.md).

> **Run config (reproducible):** client seed fixed `0x1a2b3c4d`, solo Web-Worker sim
> (`cozyThreats:true`, `seedTown:true`, `deferThreatsUntilBuildings:6` — confirmed at
> [sim-worker.ts:59-81](../../games/citadel/client/src/worker/sim-worker.ts#L59)), system
> Chrome + WebGPU. Two runs: the skill's `play.mjs` default plan (SECONDS=200 SPEED=4,
> `reloads:0`, only a benign 404) + a focused `ef-probe.mjs` (scratch, git-ignored under
> `citadel-playtest-out/`) that places chapel+market+watchpost on the seeded house and reads
> the live snapshot's per-villager `mood` + per-house `lacks*`/`mood` back over ~12 samples.
> Both runs against the **uncommitted E/F working tree** (quiescent — no game-file edits mid-run).

## Phase E — per-villager mood: ✅ VERIFIED LIVE IN A REAL BROWSER

The whole E pipeline (sim reads a villager's HOME-house mood → surfaces it on
`VillagerSnapshot.mood` → renderer dims/slumps the sprite) is confirmed at the data layer:
in the `ef-probe` samples, **`villagerMood` tracked `houseMood` tick-for-tick** (68→64→63 in
lockstep as the served house's mood eased) — proving the villager living in a house carries
exactly that house's mood, and that it moves with the sim's asymmetric-drift mood (Phase B).
The default-plan run also rendered visibly varied villager sprites walking a living town
(`01-placed.png`, `99-final.png`). No page errors; determinism unaffected (read-only field,
digest byte-identical vs pre-E/F baseline — proven by `git stash` A/B on seed 0x1a2b3c4d).

- **Minor observation (not a bug):** villagers *in transit* between tiles occasionally
  sample `mood=null` in the probe read-back, snapping back to the real value next sample —
  a snapshot-timing artifact of reading mid-walk, not a mood-computation fault. Worth a glance
  if a future consumer treats `mood` as always-present at the exact walk frame.

## Phase F — motivation (inviting-gap pulse + contentment banner): mechanism verified, banner NOT flipped in-run

- **The predicate is correct.** `allHomesCovered` (computed client-side from the same per-house
  `lacks*` the sim writes) held **false** the whole probe run — *correctly*, because the seeded
  house only ever reached `{lacksFaith:true, lacksSafety:false, lacksGoods:false}` (mood ~63 =
  base 40 + ~2 met needs mid-ease). Faith never met: the chapel was placed 4 tiles away (well
  within `SERVICE_RADII.chapel=8`) but was **not road-connected / staffed**, so it provided no
  coverage. So F's banner *should not* have fired, and didn't — the mechanism is behaving, the
  scripted placement just never achieved full 3-need coverage.
- **The inviting-gap pulse renders.** `ef-01-served-town.png` shows the coverage overlay active
  with the orange catchment diamonds + gap markers — the Phase F pulse substrate is live.
- **The review fix is load-bearing here.** `uncoveredHouseTiles` now reads the sim's
  authoritative per-house `lacks*` (not recomputed market geometry), so the pulse and the
  `allHomesCovered` banner can never disagree about goods (which the sim gates on stockpile
  availability, not just market-in-range). See [coverage.ts](../../games/citadel/client/src/render/coverage.ts).
- **Not yet fully green:** the false→true banner edge was never triggered because no run
  produced a fully-covered house. **Acceptance still open:** a run that places
  chapel+market+watchpost **road-connected + staffed** in range of a house, watches mood climb
  to 100 and all three `lacks*` clear, and confirms the single "Every home is prospering." toast
  fires exactly once on the rising edge (and not on save-load of an already-happy town). The
  default `play.mjs` plan should be extended to lay roads to its service buildings (it currently
  places the economy chain but no connected services — none appeared in `byType`).

## A–I cozy visual — the town is finally alive, fed, and fire-recoverable across 200+ days ✅

The headline win the whole pivot was for: the default-plan run reached **Day 237 (deep winter),
Pop 5/12, Happy 37, Grain 1312** with `Threat:0 / Fire:none / Disease:none` at the end — a
calm, fed, self-recovering town that was **never reachable pre-pivot** (pre-B/H towns collapsed
to Pop 0 in ~10–20 days). Winter didn't cliff it (Phase H floor); a Day-32 disease outbreak
**ended on its own by Day 33** (Phase D demotion); the late-run toasts were the *gentle*
"not enough materials to upgrade" throttle, not a collapse. The served `ef-probe` town hit
**Happy 77**. This is the A–I acceptance step (a real-browser eyeball of the cozy result) —
**met**, with the two caveats below.

## P1 (UX) — threat/dip toast COPY reads pressure-game, undercutting the cozy contract — ✅ SHIPPED 2026-07-01

**Fixed.** The event strings now branch on the same `cozy` flag the mechanics already use:
- **Fire** ([fire-system.ts](../../games/citadel/sim-core/src/systems/fire-system.ts) `_igniteBuilding`):
  ignition → *"a … hearth is smouldering — a well nearby would settle it."*; spread →
  *"the smoulder drifted to a … — keep a well close."*
- **Disease** ([disease-system.ts](../../games/citadel/sim-core/src/systems/disease-system.ts)):
  onset → *"N villager(s) are under the weather."*; ended → *"the town is back on its feet."*
- **Immigration** ([immigration.ts](../../games/citadel/sim-core/src/systems/immigration.ts) — gained a
  `cozy` constructor opt, wired from `sim-bootstrap.ts` like Fire/Disease): a hungry departure →
  *"a villager left to find food (pop N) — the larder is bare."* (never "starved (pop 0)").

The **sharp** strings are kept verbatim under `cozyThreats:false` (Challenge mode) — the
regression guards match on them (`defer-threats.test.ts` `THREAT_RE`, `phase45.test.ts`). A new
copy-contract block in [cozy-threats.test.ts](../../games/citadel/sim-core/src/systems/cozy-threats.test.ts)
pins the fire cozy/sharp split both ways. **Determinism:** reproducible (run1==run2 byte-identical)
and **no numeric drift** — per-day summaries byte-identical vs the pre-P1 baseline; the only diff is
the event copy, which is the intended change. All gates green (sim-core 226/226, client 397/397,
Citadel typecheck clean). Copy verified rendering in a headless `sim:citadel` run.

### (Original finding, kept for the record)

In the `ef-probe` run (fresh boot, past the defer gate, no well placed) the toast feed read:
*"a house caught fire!"*, *"fire spread to a bakery!"*, *"a villager starved (POP 0)"*
(`ef-01-served-town.png`, status bar "Fire: 2 building(s) burning!"). **The mechanics are
cozy-correct** — `cozyThreats:true` is wired (sim-worker.ts:68) and `cozy-threats.test.ts`
proves cozy fire *never razes* (the "spread" is a happiness-dent propagating, not destruction);
the POP 0 immediately recovered ("an immigrant arrived (POP 1)") — the known 1-house small-town
churn, not a spiral. **But the WORDING** ("caught fire!", "spread!", "starved") is alarming and
reads like the sharp pressure game, contradicting decision #3 (diegetic, calm) and #5/#9
(recoverable dip, never a loss). A player can't tell from the copy that nothing was actually
taken from them.

- **Finding type:** UX (copy/tone), not a mechanics bug.
- **Acceptance:** re-word cozy-path threat toasts to match the contract — a smouldering fire
  reads as a tended, recoverable event ("a hearth is smoking — a well nearby would settle it"),
  disease as "under the weather", a food dip as a gentle nudge, never "starved (POP 0)" /
  "spread!". Confirm the sharp wording only appears under `cozyThreats:false` (Challenge mode).
  Source: the event strings emitted by FireSystem/DiseaseSystem + the starvation event in
  immigration/economy. (P1 because tone is the cozy pivot's whole point; low code risk — copy.)

## P2 (tooling) — `play.mjs` HUD read (✅ DONE) + service placement (⏳ OPEN, root-caused)

**Instrumentation half — ✅ DONE 2026-07-01.**
- `window.__citadel.snapshot()` now returns the latest `RenderSnapshot`
  ([main.ts](../../games/citadel/client/src/main.ts), dev-only hook), so a harness reads
  `day/population/happiness/tier/stockpiles/activeFires/**allHomesCovered**` directly instead of
  scraping the (stale-since-2026-06-30) DOM HUD.
- `play.mjs` `readHud()` now prefers the snapshot (`timeline[].src === "snapshot"`; DOM kept only
  as a labelled fallback), and tracks the `allHomesCovered` false→true edge across the run
  (`outcome.allHomesCoveredEver` / `allHomesCoveredEdgeAtSecs`). So the Phase-F banner edge is now
  **assertable, not inferred** — the harness would catch it the tick services connect.

**Placement half — ✅ DONE 2026-07-01 (follow-up).** `play.mjs`'s plan is now **seed-aware**:
- It seeds the occupancy set from `__citadel.buildings()` **including the seeded road spine** — the
  crucial fix. (First seed-aware attempt still collapsed to **pop 0**: it excluded roads from `occ`,
  so a building planned onto a spine tile *removed* the road, severing the seeded core's connectivity
  flood → the seeded farm disconnected → its lone founder starved → pop-0 deadlock. Reserving the road
  tiles fixed it — pop now holds ~5–8.)
- It anchors on the seeded **house** (coverage anchor) and places chapel/market/watchpost with a new
  coverage-aware ring placer (`addNear`) that guarantees each service's footprint **centre** is within
  `SERVICE_RADII` (=8, center-to-center Manhattan — the exact test in
  [needs-happiness.ts](../../games/citadel/sim-core/src/systems/needs-happiness.ts):119-160) of the
  anchor, landing clear of the seeded box (its footprints are in `occ`). Plus 2 extra houses + 2 wells
  near the anchor.

**Result (live, seed `0x1a2b3c4d`, 200s@4×, `reloads:0`, only a benign 404):**
`services-in-radius {chapel:true, market:true, watchpost:true}`; the services staff organically and
**`allHomesCovered` holds `true` for all 49/49 timeline ticks**, `happy` **91–99** the entire run
(vs. `covered:false` / `happy ~35` before the fix). `outcome.allHomesCoveredEver:true`,
`finalAllHomesCovered:true`. The 4 `economyMissing` (mill/bakery/tradingpost/woodcutter) are the
*redundant second* bread chain — the seeded chain already feeds the town, so their absence is benign.

**Residual (not a defect):** `allHomesCoveredEdgeAtSecs` is `null` / `allHomesCoveredFromBoot:true` —
coverage is reached during the ~40-day headless boot, *before* the harness's first 4-second sample, so
the driver can't observe the exact `false→true` instant (a sampling race, surfaced honestly by the new
`coveredFromBoot` outcome field). The banner's rising-edge firing + seeded-silent (no toast on an
already-covered load) behavior are unit-tested in `main.ts`'s latch; forcing the harness to catch the
sub-second edge would mean artificially delaying placement, which isn't worth the harness complexity.
So Phase F is now **fully placement-verified live** (a prospering town is reliably reachable), with the
edge itself covered by unit tests rather than the live harness.

## Not in scope here
Fixing the toast copy or extending the driver — captured as P1/P2 above for a deliberate pass.
This todo records the E (verified) / F (mechanism verified, banner acceptance still open) /
A–I cozy-visual playtest result.
