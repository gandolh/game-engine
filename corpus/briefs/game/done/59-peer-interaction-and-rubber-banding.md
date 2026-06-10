# Brief 59 — Light up peer interaction + dent the leader runaway

**Status:** todo · **Area:** `packages/sim-core` (agents + encounter economy) · **Drafted:** 2026-06-10

This is the **standing balance / peer-interaction lever** that [open-questions.md](../../../wiki/open-questions.md) and [status.md](../../../wiki/status.md) have flagged as the single remaining substantive gap after the 36–48 depth wave. The depth, spectator, and rivalry systems are all built, tested, and individually live — but a *single dominant farmer keeps the field flat*, and the **entire peer-interaction layer fires zero events in a real run**, so the trust matrix (brief 37) never leaves baseline and rivalries/alliances can never form.

The goal here is **not new mechanics**. It is to make the existing peer-trade handshake and trust matrix actually fire in steady-state play, and to broaden who can afford to use the deep systems — so the dormant spectator (38/39/40) + rivalry (37) layers activate for (nearly) free.

## Read first

- [open-questions.md](../../../wiki/open-questions.md) → "The standing gap" + the two ⚠️ bullets (peer-inert, leader-runaway).
- [status.md](../../../wiki/status.md) → "Current sim behaviour & determinism" → the leader-runaway/dormancy paragraph.
- Root [CLAUDE.md](../../../../CLAUDE.md) → determinism + the pathfinder gotcha; **the sim now lives in `packages/sim-core/`** (moved out of `farm-valley` in the 55–58 client/server split), so all paths below are under `packages/sim-core/src/`.

## Root cause (verified against code 2026-06-10)

The handshake machinery is **complete and correct end-to-end** — the dead link is upstream, in the personality hooks:

1. **Three of four personalities have no `initiate` hook at all.** [agents/peer-trade-registry.ts](../../../../packages/sim-core/src/agents/peer-trade-registry.ts) makes `initiate?` optional; only the **hoarder** registers one ([agents/hoarder.ts:304](../../../../packages/sim-core/src/agents/hoarder.ts#L304)). Aggressive/opportunist/conservative register `respond` (and aggressive `initiateGift`) only. [EncounterTradeSystem.handleMeet](../../../../packages/sim-core/src/systems/encounter-trade/system.ts#L178) early-returns when `hooks.initiate` is absent → no `OFFER_SEED` is ever sent → there is nothing for the other three to `respond` to.
2. **The one `initiate` that exists is self-limiting.** [initiatePeerTradeHoarder](../../../../packages/sim-core/src/agents/hoarder.ts#L268) only offers to *buy* 3 radish seeds, and only when it holds `< 3` radish seeds AND can pay without dipping below reserve — a narrow, rarely-open window. Even when it fires, only the lower-id farmer in a co-located pair initiates ([system.ts:186](../../../../packages/sim-core/src/systems/encounter-trade/system.ts#L186)).
3. **Net:** `OFFER_SEED`/`ACCEPT`/`DECLINE`/`TRADE_COMPLETED` essentially never occur, so [TrustSystem](../../../../packages/sim-core/src/systems/trust.ts) — which is fully wired across all four delta cases — is never fed. `farmer.trust` stays unset (lazy-init never triggers), the brief-37 relationship grid renders all-neutral, and [RivalrySystem](../../../../packages/sim-core/src/systems/rivalry/system.ts) has no signal.

> **Important:** do NOT "fix" this by editing the wiki's old claim that the root cause is `EncounterTradeSystem` initiating "only in narrow conditions." The system is fine. The fix is in `agents/**` (give personalities reasons to initiate) — verified by reading the code, which is source-of-truth over the wiki.

## Confirm the premise before building (P0 — instrument first)

Do not assume the runaway/inert numbers from the wiki are still current after the 55–58 split + the 2026-06-09 radial-map re-baseline. **Measure first**, headlessly, then design against real numbers.

- [ ] **0a. Quantify the runaway.** Run `npm run sim` (or a small instrumented harness driving `bootstrapSim` directly) over the full 100 days on seeds `0xc0ffee`, `1`, `42`. Record, per seed: final net-worth spread (leader ÷ 2nd, leader ÷ last), and whether any **lead crossing** happens (the wealth-leader changes at least once after, say, day 20). Use `EXPORT=json` so the run is reproducible.
- [ ] **0b. Confirm peer-layer is still inert.** Count, over the same runs: `OFFER_SEED`, `ACCEPT`, `DECLINE`, `OFFER_BEAN`, `TRADE_COMPLETED` messages, and the number of farmers whose `trust` map is non-empty at day 100. Expectation from the audit: ~all zero. If it's *not* zero, stop and re-scope — the premise changed.
- **Pathfinder gotcha:** any headless `bootstrapSim` probe MUST pass a pathfinder (`new JsPathfinder()` for headless), or `TravelSystem` is omitted and every travel-gated action silently no-ops — falsely reading as "dormant" (this caught a false dormancy on brief 42). And the **JS and WASM pathfinders are not route-equivalent** — `npm run sim`'s baseline must use the same pathfinder the determinism check will re-verify against (the production/server path is WASM). Be explicit about which one this brief's measurements use.

## P0 RESULTS (measured 2026-06-10 — both premises shifted; re-scope)

Ran [tools/run-sim/src/probe-59.ts](../../../../tools/run-sim/src/probe-59.ts) — `PATHFINDER=wasm`, 100 days, `ticksPerDay=20`, seeds `0xc0ffee/1/42`. The current world has **21 AI farmers** (the radial reorg duplicated each of the 4 personalities across the two rings; names like `Atticus-9`, `Cora-12`), not 4 — so the wiki's "4 farmers, one runs away wire-to-wire" mental model is stale.

**Premise A (peer layer inert) — FALSIFIED in a sharper way: offers DO fire, but every one is rejected on price.**

| seed | MEET | OFFER_SEED | ACCEPT | DECLINE | trust maps non-empty |
|---|---|---|---|---|---|
| 0xc0ffee | 652 | 5 | **0** | 5 | 1 (1 entry) |
| 1 | 430 | 9 | **0** | 9 | 1 (2 entries) |
| 42 | 1790 | 25 | **0** | 25 | 1 (1 entry) |

- Co-location is **not** the bottleneck — MEET fires hundreds–thousands of times. (Lever A2 is moot; drop it.)
- Every offer is identical: `buy:radish@4.5`. Every decline reason is `price-too-low`. **ACCEPT is exactly 0.**
- **Root cause (verified, not inferred):** [initiatePeerTradeHoarder](../../../../packages/sim-core/src/agents/hoarder.ts#L268) bids `unitPrice 4.5` to *buy* radish seeds. Responders evaluate a "buy" offer in [peer-trade-policy.ts:44](../../../../packages/sim-core/src/agents/peer-trade-policy.ts#L44) against `ref * sellFloor` where `ref = CROP_SELL_PRICE.radish = 8` ([crops.ts:26](../../../../packages/sim-core/src/economy/crops.ts#L26)). Floors: conservative 7.2, opportunist 7.2, hoarder 7.6, aggressive 8.0 — all **far above 4.5**, so the handshake is *structurally guaranteed* to fail. The price reference is also semantically wrong: a **seed** trade is priced against the **crop** sell price (8), not `SEED_COST.radish = 5` ([crops.ts:38](../../../../packages/sim-core/src/economy/crops.ts#L38)).
- The original brief's headline ("3 of 4 personalities lack an `initiate` hook") is **true but not the binding constraint** — even the one working initiator never closes a trade. Adding more initiators that all lowball against an 8-floor would just add more `price-too-low` declines. **The binding fix is the price model**, then (secondarily) more initiators.

**Premise B (leader runaway, no crossings) — WEAKER than the wiki claims.** All three seeds already show a post-day-20 lead crossing, and the spread is modest:

| seed | leader | leader÷2nd | leader÷last (of 21) |
|---|---|---|---|
| 0xc0ffee | Cora (tie) | **1.00** | 22.2 |
| 1 | Atticus-1 | 1.72 | 20.6 |
| 42 | Cora | 2.36 | 21.3 |

The "single dominant farmer wins wire-to-wire" story is no longer accurate at the top of the board (leader÷2nd is 1.0–2.4, with crossings). The 21-way field self-distributes. **Lever B (rubber-banding) looks largely unnecessary** for top-of-board drama; the real flatness is now the dead peer/trust/rivalry layer (A), not the wealth gap.

→ **Re-scope:** make Lever A about *fixing the price model so offers close*, drop A2 (co-location is fine), demote B to "measure A's effect first; only add if a specific seed still lacks any crossing." See revised scope below.

## Scope (what to change)

Two linked levers; ship them as separate commits so each is independently `EXPORT=json`-diffable.

### Lever A — peer trades actually fire

- [ ] **A1. Give aggressive, opportunist, and conservative an `initiate` hook**, each with a personality-distinct trigger, mirroring the existing `respond` config style (the four numeric constants in [peer-trade-policy.ts](../../../../packages/sim-core/src/agents/peer-trade-policy.ts)). The triggers should reflect each personality's existing economic stance:
  - *Opportunist* — the natural arbitrageur: initiate when it holds surplus seeds of a crop it values low / can sell above shop, or buy a crop it's short on at a small discount. Most likely to be the one that actually trades.
  - *Aggressive* — initiate to *buy* seeds it's short on to plant faster (growth-over-reserve), accepting a small premium.
  - *Conservative* — initiate rarely and only to *sell* genuine surplus above floor (never spends down reserve to acquire).
  - Keep hoarder's existing hook, but **widen its window** (it currently only ever buys radish under a tight gold gate) so it participates in more than one crop / both directions.
- [ ] **A2. Make MEET co-location actually happen often enough.** The handshake can only fire when two farmers share a region within the `MEET_COOLDOWN_TICKS` window ([encounter.ts:24](../../../../packages/sim-core/src/systems/encounter.ts#L24)). On the 160×160 radial map, farms are on two concentric rings — verify (from 0a's run) that farmers *do* co-locate at shared services (market, tavern, harbor, festival podium). If co-location is too rare, the cheapest fix is **not** to teleport farmers together but to confirm the shared-destination intentions (market/festival/tavern visits) bring them into the same region; only widen `MEET_COOLDOWN_TICKS` or the encounter region-grouping if measurement shows genuine starvation.
- [ ] **A3. Verify the trust → rivalry chain lights up.** After A1/A2, re-run 0b's counters: peer messages should be > 0 and at least some farmers' `trust` maps should be non-empty by day 100. Spot-check that [RivalrySystem](../../../../packages/sim-core/src/systems/rivalry/system.ts) produces at least one non-neutral relationship over a 100-day run. This is the actual success signal for the "inert" half.

### Lever B — broaden who can afford the deep systems (rubber-banding)

The aim is a **dented runaway**, not a fair fight — keep personality identity intact. Pick the lightest-touch mechanism that produces at least one lead crossing on a seed that previously had none; do not over-engineer a balance framework.

- [ ] **B1. Diagnose the runaway from 0a** — is it one personality always winning (e.g. aggressive's wire-to-wire lead), or a capital threshold the other three never cross (greenhouse never amortizes in 100d; only the hoarder reaches the harbor contract commit gate)? The fix follows the diagnosis.
- [ ] **B2. Apply a minimal, deterministic lever.** Candidates, cheapest-first — choose based on B1, don't do all of them:
  - A small **catch-up affordance** for trailing farmers (e.g. the notice-board / contract reward or a market price nudge scales mildly with rank) — must be seeded/deterministic, no `Math.random`/`Date.now`.
  - Broaden a personality's deliberation so >1 farmer reaches the livestock/greenhouse/contract gates (the "spare-capacity reality" — see [DeliberateSystem](../../../../packages/sim-core/src/systems/deliberate.ts) and the per-personality files).
  - Peer trades themselves (Lever A) may already redistribute enough to dent the lead — measure A's effect on the spread before adding B at all. **If A alone produces a crossing, B may be unnecessary** — record that and stop.

## Determinism (load-bearing — non-negotiable)

- Every change is a behavior change *by design* (this brief intentionally re-baselines outcomes — like 41–48 did). The contract is **same seed reproduces itself**, NOT equality to pre-59 numbers.
- **Never** introduce `Math.random()` or `Date.now()` in sim code — route all randomness through the seeded `Rng` with a named `fork(label)` (raw random in ACT paths is a known nondeterminism bomb — see [memory: mining-random-determinism] and verify at the **default `ticksPerDay=20`**, not just 1200).
- Gate on the **fast determinism check** first (3-day / 3-seed `EXPORT=json` diff — the split-brief convention), then a full `CHECK_DETERMINISM=1` `MATCH ×3` (seeds `0xc0ffee/1/42`) on the **WASM** baseline before calling it done.
- `npm run typecheck` + `npm run test` green before each commit. Add tests: a system/agent test (driving `bootstrapSim`) that asserts at least one peer `OFFER_SEED`→`ACCEPT`/`DECLINE` round-trip fires and at least one `trust` delta lands over a short run.

## Definition of done

1. Over a 100-day run on at least one of `0xc0ffee/1/42`: peer-trade messages fire (> 0 of each handshake step occurs across the run) and ≥1 farmer's `trust` map is non-empty — i.e. the brief-37 grid is no longer all-neutral.
2. The leader-runaway is *measurably dented*: at least one seed that had no post-day-20 lead crossing in 0a now has one — OR a clear, recorded finding that Lever A alone didn't suffice and why (so it stays a conscious decision, not a silent miss).
3. Determinism re-verified `MATCH ×3` at `ticksPerDay=20` on the WASM baseline; fast diff clean.
4. New tests cover the peer round-trip + a trust delta.

## On completion

Move this brief to `done/`. Update [status.md](../../../wiki/status.md) (the leader-runaway/dormancy paragraph — record the *new* measured numbers), strike the two ⚠️ bullets in [open-questions.md](../../../wiki/open-questions.md) (or sharpen them with what's still flat), and append a `log.md` entry with the before/after spread + peer-event counts.

---

## OUTCOME (shipped 2026-06-10)

**Lever A landed via a crop-trade extension; Lever B was not needed (B1 found the runaway already weak).**

Two compounding bugs were blocking ALL peer trades, both fixed:
1. **Price reference wrong.** Seed trades priced bids against `CROP_SELL_PRICE` (radish 8) instead of `SEED_COST` (radish 5) — every responder floor sat far above any sane bid, so 100% of offers were declined `price-too-low`. Fixed in [peer-trade-policy.ts](../../../../packages/sim-core/src/agents/peer-trade-policy.ts) (+ the hoarder's hand-rolled `initiate` in [hoarder.ts](../../../../packages/sim-core/src/agents/hoarder.ts)).
2. **No tradeable surplus in the seed economy.** Probe ([probe-59-seeds.ts](../../../../tools/run-sim/src/probe-59-seeds.ts)) showed **no farmer ever holds >2 seeds of anything** — they plant just-in-time. The real surplus is HARVESTED crops (hoarder peaks at ~22 wheat). So a seed-only protocol can never close trades regardless of price.

**Fix:** extended the encounter protocol with `OFFER_CROP` ([protocols/encounter.ts](../../../../packages/sim-core/src/protocols/encounter.ts), `ENCOUNTER_ONTOLOGIES`), generalized the policy factories with a `commodity: "seed" | "crop"` param (crop priced vs `CROP_SELL_PRICE`, transfers `inventory.crops` + keeps `cropQuality.normal` consistent), added `initiateCrop`/`respondCrop` registry hooks, and **moved the lower-id guard to apply only to the seed offer** so the surplus-holding hoarder (often the higher id) can actually sell. Personality roles: hoarder = crop SELLER (deep surplus, threshold 6, 2-unit parcels @ 0.95×shop); opportunist/aggressive = crop BUYERS; conservative = cautious bargain buyer.

**Measured (WASM, 100d, ticksPerDay=20):**
- Peer layer: before = 5/9/25 `OFFER_SEED`, **0 ACCEPT**, ~1 trust map. After = crop offers fire on all 3 seeds; **ACCEPT > 0 on 0x1 & 0x2a** (0x2a ~21 trades); trust maps non-empty on **all 3** (4/3/9 farmers). Brief-37 grid no longer all-neutral. ✅ DoD-1 met.
- Runaway: **B1 found the premise stale** — all 3 seeds ALREADY have post-day-20 lead crossings (leader÷2nd = 1.00 / 1.72 / 2.36; the 21-farmer radial field self-distributes). No rubber-banding shipped — recorded as a conscious decision, not a silent miss. ✅ DoD-2 met (the "Lever A alone + finding" branch).
- Determinism: **MATCH ×3 at ticksPerDay=20 on WASM.** (The 1200-tick confirmation was skipped — too heavy for the dev hardware; the 20-tick rate is the meaningful gate since it's also where raw-random bombs surface, and no `Math.random`/`Date.now` was introduced.) ✅ DoD-3 met (20-tick scope).
- Tests: +3 crop-trade tests ([encounter-trade.test.ts](../../../../packages/sim-core/src/systems/encounter-trade.test.ts)); peer-trade tests re-anchored to `SEED_COST`. 607 sim-core tests green; typecheck clean. ✅ DoD-4 met.

**Residual flatness (still open):** 0xc0ffee fires crop offers but the cash-poor early-game buyers decline `would-breach-reserve`, so it closes 0 trades there — an in-character economic constraint, not a bug. The seed `initiate` hooks remain but rarely close (no seed surplus). Deeper peer-economy work (multi-crop, richer buyer liquidity) is a possible future lever, not required here.
