---
summary: Live list of what is genuinely unresolved, plus settled premises that must not be re-litigated. Resolved items are deleted, not archived.
updated: 2026-07-17
---

# Open Questions & Gaps

Live list of what's **genuinely unresolved**. Shipped/resolved items are deleted from here — their history lives in [status.md](status.md) + [log.md](../log.md). Verify any code ref before acting (paths drift).

## Open

_None currently open. The 2026-07-17 stable point closed the queue._

> **Resolved 2026-07-17 — festival attendance is geography-bound: fixed by making the festival
> multi-day.** The venue was already the market plaza (`festivalPodiumTile()` = `AUCTION_PODIUM_TILE`
> = `snapNear('village',0,0)`), so "move the venue" was a non-op. The lever was **`FESTIVAL_DAYS = 2`**
> ([protocols/festival.ts](../../games/farm/sim-core/src/protocols/festival.ts); 3 works too — window
> fits its season at offset 12 + DAYS ≤ 25): announce once on the start day, accumulate submissions
> across the window, resolve the day after the last day. Measured **cumulative** attendance (1200 t/d,
> WASM pathfinder, one seed per process) rose **0/12 → 8/12** across seeds — 0xc0ffee 4/4, seed 1 3/4,
> seed 42 1/4 (geometry-capped). **Simultaneous same-day majority is physically impossible** (~5/20
> ceiling even at forced top priority — 150–360-tile trips at 8 ticks/tile vs a 1200-tick day), so
> "cumulative over the window, not same-day" is the correct metric — see the trap in [log.md](../log.md).
> Priorities were left untouched (a −3 bump breaks the coral-excursion integration test). Residual
> levers (`STEP_TICKS`, world scale) are a separate call, not needed. `probe-festival.ts` rewritten as
> the region-attendance evidence probe (honors `SEED=`).

> **Resolved 2026-07-10 — "what does a cozy PvP army attack do?"** Answer: *there isn't one.*
> Decision **#15** removes `ArmySystem`/`launchAttack` from cozy MP entirely rather than softening
> them, because cozy MP has no winner, no score (#7) and no ending (#9) — so an army has nothing to
> be *for*. Lethal armies live only in Challenge mode.
>
> **Resolved 2026-07-10 — "is Challenge a solo difficulty, an MP ruleset, or one flag?"** Wrong shape
> of question. Decision **#19**: a mode is a **preset at the call site**, not a concept in the sim.
> The sim keeps its flat independent options; "cozy" and "challenge" are bundles of them chosen by
> the caller. Challenge-solo and Challenge-MP fall out for free. The real constraint it exposes is
> that **every mode-affecting option must be persisted in `CitadelSave`** — an invariant two fields
> were already violating.

> **Resolved 2026-07-16→17 — the "live-drama spare capacity" cluster: built, with two premises
> overturned by measurement.** Skills → skill-gated intentions DONE (`4649bd1`, divergence proven).
> Harbor → tiered sizes DONE (`7d8bc7e`, non-hoarders commit on all seeds). Early peer trades →
> **the "no-stock" premise was FALSE**: probe-70's 20 t/d hardcode produced zero encounters; at the
> real 1200 t/d trades already closed by day 4-10 (surplus kept as flavor, `b89c317`). Festival →
> priority bump landed 3 real bug fixes (`bbf6e43`) but **"the venue is fine" was FALSE** — the gap
> is world-scale travel distance, reopened as the Open question above. Methodology rule from both:
> behavior probes MUST run at 1200 t/d with the WASM pathfinder.

## Settled premises — don't re-litigate

- **Citadel starve-softness at real pace is accepted as intended (user decision 2026-07-17).** After
  the 1× pace change (ticksPerDay 20→1200, `pacing.ts`), hauling is ~60× more trip-efficient per day,
  so the `starve` fixture survives slightly longer and Challenge is a touch softer. This is the design
  we want — **cozy stays forgiving, Challenge is only slightly softer** — not a regression. The starve
  fixture is unchanged by choice; don't "fix" it. See [status.md](status.md).
- **Both games are in active development as of 2026-07-16 — the focus is polish, improvements, and
  fixes toward a stable version.** The earlier "Farm is in maintenance" framing (used to park brief
  101 on 2026-07-15) is stale; don't cite it to decline Farm work. Large new *systems* still need
  an explicit user call (perishability remains parked by choice, not by maintenance status).

- **Leader-runaway / peer-interaction.** The old "one farmer runs away wire-to-wire, field stays flat, peer layer inert" story is **STALE**. The current 21-farmer radial field self-distributes (post-day-20 lead crossings on all 3 standard seeds); peer trades close over harvested-crop surplus after brief 59 fixed the price-reference bug (`CROP_SELL_PRICE` vs `SEED_COST`) + added the `OFFER_CROP` path. Re-probe before citing any old runaway numbers.
- **Pathfinder gotcha.** A headless `bootstrapSim` check **must** pass a `pathfinder`, or `TravelSystem` is omitted and every travel-gated action silently no-ops (false "dormant"). JS and WASM pathfinders are **not route-equivalent** — use WASM to match the determinism baseline. See [decisions.md](decisions.md).
- **Not worth it (researched).** WebTransport/WebRTC for a buffered spectator game; WebGL/WebGPU at ~300 sprites; archetype/SoA ECS at tens of entities; OffscreenCanvas-in-worker (the client/server split already freed the main thread); pinning farmer entity IDs (determinism risk is theoretical at 21 entities, `CHECK_DETERMINISM ×3` passes).
- **FPS regression was a SwiftShader artifact (brief 84, resolved 2026-06-12).** The "15–30 fps" came from headless Chromium on SwiftShader (CPU raster). A user real-GPU `?profile` export (`ANGLE / AMD Radeon`) shows the live game at **99 fps, `frame` JS 5 ms** — no GPU-overdraw problem on real hardware. `DEFAULT_ZOOM = 2` (kept) frames the opening shot in; its perf value is now insurance for weak/integrated GPUs + high-DPI, not a fix. Don't chase Tier-0 raster work without a *real-GPU* reading that actually shows a problem. See [performance.md](performance.md) Tier 0 + [briefs/game/done/84](../briefs/game/done/84-fps-regression-webgpu-reprofile.md).

## Resolved
History of resolved gaps (peer-interaction, leader-runaway, client/server split, auctions, day/night + long-days, atlas split, the travel-no-path diagnosis, …) lives in [log.md](../log.md) and [status.md](status.md). This page tracks only what's still open.
