# Remaining-work dispatch plan (2026-07-10)

status: **in progress — Waves 1, 2 done; 2.5, 3, 4, 5 open.** Resumable: each wave is an
independent `plan-split-dispatch` run. Tick the checkboxes as waves land; the plan survives
a context loss.

Scope: the decision-**#26** queue `{102, 99, 106, 104, 105, 98}` plus the two
unblocked-but-unstarted briefs **103** and **113**. #26's two gating items, briefs **110**
and **100**, landed 2026-07-10 (`8e930f3`, `0fd66c0`).

**Rebuilt 2026-07-11 (corpus maintenance pass):** two 2026-07-11 todos joined the queue as
**Wave 2.5** ([headless JSON run mode](closed/2026-07-11-headless-json-run-for-both-games.md),
sequenced *before* Wave 3 because it makes every later wave's headless verification cheaper)
and **Wave 5** ([building silhouette differentiation](2026-07-11-citadel-external-cc0-art-ingest.md),
render-only, last). The `sack`-drift blocker on 103 was **fixed 2026-07-11**
(`7c76522`/`36382d2`) — Wave 4 is unblocked.

Out of scope: **96** (living art reference, not a task); **101**, **107** (Farm is in
maintenance); engine **18**, **19** (parked). See [wiki/status.md](../wiki/status.md).

---

## Findings from the planning pass (verified against code — read before dispatching)

1. **104 and 105 collide on one file.** 104 item 4 (ambient-crowd cadence parity) and 105
   scope 1 (ambient-crowd honesty) both edit
   [`ambient-crowd.ts`](../../games/citadel/client/src/render/ambient-crowd.ts). 104's own
   item 4 says "land 105's decision first or in the same session." **One chunk, never two
   parallel ones.**
2. **99's Citadel item 34 also touches the Citadel client render path** (`extendTrail`,
   `boxBuilding` `noDoor`, duplicate `device.lost` handlers). It therefore collides with
   Wave 1. Either fold item 34 into Wave 1 or run 99 strictly after it.
3. **99's `maxDays` deletion touches many test files** across packages (decision #18: a
   required `CitadelSimOptions` field no system reads). Wide, mechanical, merge-hostile —
   give it its **own serialized chunk**, and check `loadFromSave`, which *computes* a
   `maxDays` of its own to pass through.
4. **113 scope 1 is already DONE** — it landed early inside brief 110 (`0fd66c0`).
   `enableArmy` defaults `false` and `launchAttack` is gated on it. The brief says
   **"Do not redo this step."** 113 starts at scope 2.
5. **103's dependency is already satisfied.** It claims to depend on "brief 97 chunk 4
   (ghost workers)". Brief 97 **closed 2026-07-10** (`c8ee284`); chunk 4 landed in wave 1
   (`releaseWorkersAt` at all four removal sites). Nothing blocks 103 on that axis.
6. **103 blocks on the `sack` scenario drift** — see the separate todo,
   [2026-07-10-citadel-sack-scenario-drift.md](closed/2026-07-10-citadel-sack-scenario-drift.md).
   Its acceptance is "challenge run playable start→**sack**-or-survive" and the fixture
   that proves a sack no longer sacks.
7. **103 contradicts itself.** The 2026-07-10 reshape header (decisions #23/#24) says
   `enableArmy` stays **false** and Challenge does *not* get armies back. Its **Acceptance**
   section still reads "challenge run playable in a real browser (raid can sack, fire can
   destroy, **army/territory active**)". The acceptance line is stale. Resolve it *before*
   Wave 4 splits, not during.
8. **105 scope 1 needs a design decision, not just code.** The brief offers three options
   (cap the layer to `population`, gate it off above a zoom level, or make ambient figures
   clearly non-villager) and leans to the third as "probably the cozy-friendliest." The
   controller picks; the brief says record the decision on closeout.
9. **105 scope 2 (MP snapshot owner-filter) is PARKED** by decision #21 and is an MP
   revival precondition. **Do not build it. Do not delete it from the brief.**
10. **Two briefs move the determinism baseline by design**: 99 (items 28 and 31) and all of
    98. A `CHECK_DETERMINISM=1` MATCH ×3 only proves *reproducibility* — each also needs an
    eyeballed headless run proving the new behaviour actually happens.
11. **106 can't be verified under cozy defaults.** Siege/hazard readouts surface rarely; the
    brief says force visible states via `cozyThreats:false` or the dev hook.

---

## Waves

Sequential. Waves 1 and 2 touch disjoint packages (Citadel client vs Farm sim-core) and
*could* overlap, but the `typecheck`/`test` gates are repo-wide, so a failure in a
concurrent run is hard to attribute. One wave at a time.

Model routing per [routing.md](../routing.md): controller/verify = **opus**; executor chunks
= **Sonnet 5** by default including medium-hard sim work; bias borderline → junior. Reserve
opus executor chunks for genuinely novel/risky work.

Every chunk prompt must forbid `git stash` / `git checkout` / `git reset` — parallel chunks
share one working tree.

---

### [x] Wave 1 — Citadel client, render-only, low risk — **DONE 2026-07-10**

Landed: **106** (`242dbbe`), **104** items 2+4 + **105** scope 1 (`26deb45`). Two parallel
junior/Sonnet chunks on disjoint lanes; gates green (typecheck 0, `@citadel/client` 471/471,
`@engine/core` palette guard 184/184); browser-verified on real WebGPU. Briefs moved to
`done/`. 105 scope 2 stays parked (#21). See the status.md Wave-1 entry.

No sim impact, so no determinism exposure. Two chunks, **parallel-safe** (disjoint files).

| Chunk | Brief | Files | Model |
|---|---|---|---|
| 1A | **106** — migrate the remaining DOM siege/hazard readouts onto `@engine/ui` widgets, following the top-HUD-bar / toasts / build-bar / inspect-panel precedents (a11y mirror where the precedent has one). Remove the dead DOM + CSS. **Keep the load/save file-input DOM** — browser requirement. | `games/citadel/client/src/main.ts` (see the `:107` comment), the `@engine/ui` widget dir | Sonnet |
| 1B | **104 (items 2 + 4) + 105 (scope 1)** — one chunk, shared file. Item 2: L/R sprite facing flip driven off the existing screen-space heading tracker's continuous deltas. Item 4 + 105: settle the ambient-crowd decision, then implement it and put the crowd on the same cadence rules so both layers read alike. | `render/ambient-crowd.ts`, `render/citadel-fx.ts`, `render/entity-interp.ts` | Sonnet |

**Do not redo**: 104 item 1 (walk-gait `gaitOffset`) and item 3 (corner-cutting spline) are
already live — item 3 shipped 2026-07-08, item 1 was live before that.

**Controller decides before splitting**: which of 105's three ambient-crowd options to build
(recommend: make ambient figures clearly non-villager — smaller/dimmer/no role accessories).

**Gates:** `npm run typecheck`; `npm run test`; @citadel/client suite green; **a real-browser
`playtest-citadel` pass** — 106 needs `cozyThreats:false` (or the dev hook) to force a raid/
fire so the migrated readouts can be seen updating live; 104 needs a feel sign-off (villagers
stride rather than glide, face their travel direction, no smearing on load/replay); 105 needs
a before/after screenshot showing the crowd no longer over-reads population.
*UI is not done until it has been seen in a browser — unit tests are not the acceptance bar.*

---

### [x] Wave 2 — Farm sim-core economy, baseline-moving — **DONE 2026-07-11**

Strictly sequential: **99 → 98**. 99 centralizes the crop-debit path that 98's trade loop
then transfers stock through; doing 98 first means writing the transfer twice.

#### [x] 99 — P2 debt cleanup (review findings 28–35) — **DONE 2026-07-11**

Landed as `f244bea`/`98839a6` (the wave), `f260a7e` (test-probe adjudication), `7da72da`
(`maxDays`). 5 chunks, disjoint lanes, 4 junior + 1 senior (rng/auction — promoted because
the determinism gate can't tell correct from wrong-but-deterministic). Farm baseline moved by
design and explains itself; Citadel byte-identical. Brief moved to `done/`. See status.md.

Source detail lives in
[closed/2026-07-02-full-repo-review-findings.md](closed/2026-07-02-full-repo-review-findings.md).
⚠️ **Verify every item against current code first — brief 97's two waves moved these lines.**

| Chunk | Items | Model |
|---|---|---|
| 2A | **Farm, item 28** — `moveNormalQuality` + mill processing decrement `crops` but not `cropQuality`, producing phantom quality tiers (festival wins, sale mispricing). Centralize `debitCrop(inventory, crop, qty)` and route **all** debits through it. ⚠️ moves baseline; needs a red-before-fix test. | Sonnet |
| 2B | **Farm, items 29 + 30 + 32** — inject `ticksPerDay` into harbor's `deliveryDay = tick/20` (FestivalSystem is the pattern). Decide once on the dead scaffolding: `deliver-contract` (empty handler, 3 AP) and the CNP contract-net (module-global registry survives `bootstrapSim`, tasks never reach `completed`) — implement or delete, don't leave. `buildEvents` shared scratch array → fresh/pooled per call; `defaultSpriteState` singleton → per-run construction. | Sonnet |
| 2C | **Farm, item 31 (RNG/lifecycle hygiene)** — ShopSlateSystem forks `"shop-slate"` instead of using the raw rng (⚠️ baseline); auction settlement escrows at bid or falls back to the runner-up rather than retrying forever; festival tie-break must either use the rng it draws or stop drawing it (⚠️ baseline); evict `EventFeedSystem.seen` + `settledAuctions`; fix the dead `hasGoods` ternary at `watering/harbor.ts:107`. Needs red-before-fix tests. | Sonnet |
| 2D | **Citadel, items 33 + 34** — ProductionSystem is O(villagers × buildings) per tick: build one `tileToBuildingId` map per tick (`sim-bootstrap`'s `getBuildings` is the pattern); precompute FireSystem's daily burning/wooden lists + firebreak lookup. Client niggles: `extendTrail` incremental Set, `boxBuilding` `noDoor` contract (implement the option or fix the stale doc), collapse the duplicate `device.lost` handlers. **Collides with Wave 1 — must run after it.** | Sonnet |
| 2E | **Delete `maxDays`** (decision #18) — a required `CitadelSimOptions` field no system reads; every caller passes it, nothing consumes it. Remove the field and every call-site argument. **Check `loadFromSave`, which computes its own `maxDays` to pass through.** Wide + mechanical + merge-hostile → **serialize this chunk alone.** Do *not* wire it up. | haiku/Sonnet |

**Item 35 (MP iso render window) is EXCLUDED** — brief 108's live pass showed it latent behind
the client's hardcoded 96×96 world; it belonged to brief 110, which has landed.

**Gates:** typecheck + tests green; **Farm determinism MATCH ×3** (record which items moved
the baseline and why); **Citadel determinism MATCH ×3**; items 28 and 31 need
red-before-fix tests.

#### [x] 98 — Farm market wall: wire the trade loop (Option A) — **DONE 2026-07-11** (`490b892`)

Escrow-at-post makes oversell / double-fill / vanished-stock unrepresentable; `WallTradeSystem`
consumes `BUY_REQUEST` in SNOOP (the only band after dispatch, before PerceiveSystem clears
inboxes). 42/36/40 trades close on seeds `0xc0ffee`/`1`/`42`. Determinism MATCH ×3.
**Wave 2 complete.**

Decision made 2026-07-10: **Option A. Option B (remove it) is dead.** Read
[review findings item 7](closed/2026-07-02-full-repo-review-findings.md) first — it carries the
verified evidence. The loop is dead end-to-end while still charging AP:

- `BUY_REQUEST` is forwarded to the seller's inbox
  ([market.ts:132-155](../../games/farm/sim-core/src/systems/economy/market.ts)) but nothing
  consumes it — PerceiveSystem's switch doesn't, then clears the inbox.
- `TRADE_COMPLETED` is **never sent** in production code, though readers exist in
  market / trust / event-feed.
- The `marketOffers` belief that three buying personalities gate on (aggressive:176,
  hoarder:127, opportunist:127) is written **only by test fixtures** — the buy path can
  never fire live.
- `"sell-from-wall"` has an AP cost
  ([ap.ts:32](../../games/farm/sim-core/src/systems/economy/ap.ts)) but **no ActSystem case**.
- `handlePostOffer` never validates/escrows seller stock (latent oversell); `offersById`
  grows all run, because `TRADE_COMPLETED`/`CANCEL_OFFER` are never sent.

**Build:** PerceiveSystem folds `OFFERS_LIST` into the `marketOffers` belief; a seller-side
`BUY_REQUEST` handler (check stock escrowed at post time, transfer gold + stock, emit
`TRADE_COMPLETED`, update the wall); an ActSystem `sell-from-wall` case; offer TTL +
`CANCEL_OFFER` sweep so `offersById` is bounded; escrow at `handlePostOffer`.

**Model: opus** — novel protocol work, baseline-moving, and the escrow/conservation logic is
expensive if wrong.

**Gates:** a multi-day headless run shows **≥1 completed wall trade per standard seed**;
gold + stock conserved (test); `offersById` bounded; determinism **MATCH ×3**. Update
[wiki/economy.md](../wiki/economy.md) + [wiki/system-ordering.md](../wiki/system-ordering.md)
if flows change (they will — a new inbox consumer lands in a scheduler band).

---

### [x] Wave 2.5 — headless JSON run mode (tooling, added 2026-07-11) — **DONE 2026-07-11** (`d224b09`)

Landed: generic `RunReport` envelope in `@engine/core/sim` + `REPORT=1`/`REPORT_FILE=` in both
tools (2 parallel junior/Sonnet chunks on disjoint lanes). Gates green: typecheck 0, full
repo tests exit 0, Farm determinism MATCH ×3, Citadel double-run byte-identical ×3 seeds and
byte-identical to pre-change code on grow+sack. The `play.mjs` driver fix was found already
landed (`__citadel.snapshot()` + snapshot-based `readHud`). Scripted-action layer deliberately
deferred. Todo moved to `closed/`.

Spec: [closed/2026-07-11-headless-json-run-for-both-games.md](closed/2026-07-11-headless-json-run-for-both-games.md).
**Read-only reporting scope only** (the scripted-action layer is explicitly separable —
defer it unless it falls out free). Sequenced before Wave 3 because 102/113/103 all carry
"prove the behaviour in a headless run" gates, and this makes those runs machine-readable
instead of console-prose archaeology. Includes the folded-in `play.mjs` driver fix (read HUD
via `window.__citadel`, not DOM scraping).

Constraints: reporting is an **observer** over `getSnapshot()` / the message bus — never a
new input to a tick. `CHECK_DETERMINISM=1` must still pass in both tools; same seed →
byte-identical report. Both games' baselines must be **byte-identical** to pre-wave `main`
(pure tooling; if a baseline moves, something leaked into the sim).

**Gates:** typecheck + tests green; determinism MATCH ×3 both games (baselines unmoved);
`npm run sim` and `npm run sim:citadel` each write a report a fresh agent can correctly
narrate a run from.

Model: controller settles the report shape (the todo's open questions); executor chunks
Sonnet (tools + client dev-hook are disjoint lanes).

---

### [ ] Wave 3 — Citadel gameplay (design gate, then build)

The controller settles the design and **writes it into the brief** before splitting. Neither
brief can be dispatched cold — 102 says "pick the smallest cozy-consistent set at session
start"; 113 says "decide at session start" for the raider-state shape.

#### 102 — Disease counterplay (playtest finding P3, the last untouched one)

Problem: disease has no proactive lever. A healer gives reactive coverage; the player can't
*prevent* or *respond to* an outbreak. Under cozy rules (Phase D) the dip always recovers —
so it is unengaging: nothing to decide, nothing to build.

Design menu (pick the **smallest cozy-consistent set**):
- **Prevention**: well coverage reduces onset chance (wells already speed fire recovery — a
  natural sibling); crowding (houses per area) raises it, rewarding breathing room. Both are
  placement puzzles, on-theme with decision #10 (terrain/placement IS the puzzle).
- **Response**: a staffed healer visibly shortens an active outbreak (if that isn't already
  true, make the effect legible); optionally a one-shot "boil water" town response with a
  real cost.
- **Legibility**: outbreak + recovery must read diegetically through the Phase-A mood/dim
  channel; the prevention effect must be visible **at placement time** (coverage-ring
  precedent).

Constraints: cozy contract holds — **disease still never kills**; all effects are throttles
toward the floor. Onset/recovery draws stay in their existing forked streams, and new gates
must **short-circuit BEFORE any RNG draw** when disabled (the defer-threats precedent) so
baselines move only where intended.

**Acceptance:** a player can point at something they built or placed and say *"that's why the
outbreak was short / never happened"* — verified in a **live playtest**, not just tests.
sim-core tests green; determinism MATCH ×3; the source todo's P3 closed.

Model: **opus** for the design gate, **Sonnet** for the build.

#### 113 — The cozy raid gets a body

**Start at scope 2 — scope 1 already landed in brief 110 (`0fd66c0`).**

Raids have a mechanic and no body: `applyRaidDamage`
([siege-resolution.ts:200](../../games/citadel/sim-core/src/systems/siege-resolution.ts)) is
an abstract `raidStrength` applied at the keep; `pickEdgeSpawn` picks an entry tile and then
nothing walks from it. Armies have a body and no mechanic: `ArmyState`
([sim-state.ts:87](../../games/citadel/sim-core/src/sim-state.ts)) carries `x, y, tileX,
tileY` and `ArmySystem` (150 lines) marches and resolves it — but it is PvP down to its
fields, and MP is deprecated. **Give the raid the army's body.**

2. A raider entity with a position — new `RaiderState`, or `ArmyState` with the PvP fields
   dropped (**decide at session start**). Lose `attackerId` and `targetPlayerId`; targeting
   becomes `keepPosition`, not "a rival's building". **Reuse `ArmySystem`'s tile-stepping and
   arrival resolution — that salvage is the reason this brief exists.**
3. Wire to the existing raid schedule. `pickEdgeSpawn` already picks the entry tile. The
   existing strength/probability bands, morale, and the scout/garrison-interceptor
   counterplay (shipped 2026-06-26) **stay authoritative** — the body must not become a
   second source of truth for whether a raid lands or how hard.
4. Resolution stays cozy: on arrival pilfer per `applyRaidDamage`'s existing rules (defense
   shrinks the theft), then **leave** — raiders walk back off the map edge. Never sack, never
   `gameOver`, never destroy. Under `cozyThreats:false` the sharp resolution stays reachable
   and **byte-identical**.
5. Render: raiders draw on the iso entity layer with the villagers' interpolation
   (incl. 104's corner-cutting spline). The snapshot carries their positions. **An
   approaching raid must be readable before it arrives — that is the entire point.**

Watch: the scout/garrison interceptor currently intercepts an *abstraction*. Once raiders
have positions, interception becomes **spatial** — check whether that's a free upgrade or a
behaviour change **before assuming**.

Constraints: cozy contract (#9) — raiders take goods, never buildings, never lives. All
randomness via `state.rng.fork(label)`; a **new** fork label so existing channels are
undisturbed. ⚠️ Baseline moves **only** if the raid schedule or strength changes; if the body
is purely additive, aim for **byte-identical** aggregate output and prove it.

**Acceptance:** a cozy raid is *seen* crossing the map, arriving, pilfering, departing; no
building destroyed and `gameOver` never set on the cozy path; `enableArmy` still defaults
false and `launchAttack` is **rejected**, not silently queued; `army.test.ts` passes with
explicit `enableArmy:true`; determinism MATCH ×3; browser-verified via `playtest-citadel`
(*"a raid must be seen, which is not a claim unit tests can make"*).

Model: **opus** (novel sim state + snapshot + render, and byte-identity to prove).

Why 113 sequences here: on a 192×192 world (#22, from brief 110) a raider's walk from the map
edge is long enough to be readable. On the old 96×96 it would have arrived almost immediately.

---

### [ ] Wave 4 — Challenge mode (last)

**103 depends on Wave 3.** Challenge is a solo preset of `cozyThreats:false`, no `seedTown`,
no threat-defer; `enableArmy` stays **false** (decision #24 — there is no second player to
point an army at). Its stakes come from the sharp fire / **disease** / **raid** path — so it
must land *after* 102 reshapes disease and 113 gives the raid a body, or it presets systems
whose final shape isn't known.

**Two things to resolve before splitting:**
- ✅ ~~The `sack` scenario is broken~~ — **FIXED 2026-07-11** (`7c76522`/`36382d2`; see
  [the closed todo](closed/2026-07-10-citadel-sack-scenario-drift.md)). The `sack` scenario
  is now a real playthrough (grows honestly, earns Town, raises the keep, sacked day 50,
  exits 1 on failure) and `sharp-raid-path.test.ts` guards reachability. 103's
  "start→sack-or-survive" acceptance is demonstrable.
- ⚠️ **The brief's Acceptance line is stale**: it demands "army/territory active", which the
  2026-07-10 reshape header explicitly reverses (`enableArmy` stays false). Fix the brief.

Shape settled by decision **#19**: Challenge introduces **no new sim state**. It is a *preset*
of the flat options the sim already takes and already persists, chosen by the caller — no
`mode` enum inside the sim. **Invariant: every mode-affecting option must be persisted in
`CitadelSave`**, or `loadFromSave` replays the command log under different rules. (Two fields
were already violating this; fixed in `19d6d98`.)

Scope:
1. **Mode plumbing** — the solo worker picks the flag bundle; save/load persists every flag
   in it; solo UI offers the choice at new-game (in-canvas, minimal).
2. **Make sharp playable again** — frozen since 2026-06-28; a playtest pass to find what
   rotted. The decree lever was purged in Phase G, so decide whether Challenge gets decrees
   back or the sharp systems get re-pointed at non-decree inputs. **Recommend the latter —
   don't resurrect purged UI.**
3. **Balance sanity only** — this is not a full balance pass. Ship the mode, verify a
   challenge run is playable start→sack-or-survive, file findings.

Dependency note: 97 chunk 4 (ghost workers) is **already satisfied** — brief 97 closed
2026-07-10, and `releaseWorkersAt` now runs at all four removal sites.

**Gates:** cozy default path **byte-identical**; regression-guard both modes' baselines ×3;
challenge run playable in a real browser.

---

### [ ] Wave 5 — building silhouette differentiation (render-only, added 2026-07-11)

Spec: [2026-07-11-citadel-external-cc0-art-ingest.md](2026-07-11-citadel-external-cc0-art-ingest.md)
(the CC0-ingest spike was **rejected with evidence** — do not re-run it; the todo's "Proposed
work" section is the task). 8 of 21 `BUILDING_RECIPES` are the same 128×92 box with a
different roof colour (`house`, `bakery`, `woodcutter`, `market`, `public-square`,
`watchpost`, `quarry`, `sawmill`, `smith`), contradicting `buildings.ts`'s own
silhouette-first design goal — and colour is the axis the day/night wash degrades. Give each
a distinct silhouette by composing existing `iso-draw.ts` primitives; bias roofline +
attached structure + ground props, not hue. The `composite([...Layer])` path from art-12 is
the natural vehicle; zero atlas growth (256×4096 is the pow2 ceiling).

Render-only, zero sim impact, could in principle run any time — sequenced last so the
gameplay waves (raid body, challenge mode) aren't queued behind art polish.

**Gates:** typecheck + tests green (EDG32 palette guard, `@citadel/client` suite); the
[whole-set critique checklist](../wiki/citadel-asset-critique.md) re-run over the changed
set; **browser-verified in `?showcase`** (UI/art is not done until seen in a browser).

Model: Sonnet executor chunks (the art-08..12 wave's precedent); opus only if a recipe needs
a genuinely new primitive.

---

## Closeout discipline (every wave)

Per [routing.md](../routing.md) and the repo's convention:
1. `npm run typecheck` + `npm run test` before any commit.
2. Route closeout through `corpus-flow`: update `wiki/status.md`, append to `log.md`, fold
   durable findings into the wiki, move the brief `todo/` → `done/` (**number prefix stays
   stable**).
3. **Commit the code and the corpus change as two separate commits.** Do this per brief, at
   closeout — don't leave finished briefs uncommitted across a long multi-wave run.
4. **Never push, open a PR, or tag without the user's explicit go.**
5. If a chunk finds a SKIP area is load-bearing, it reports **BLOCKED** — it does not work
   around it.
