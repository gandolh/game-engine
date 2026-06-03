# Corpus Log

Append-only chronological record. Each entry starts with `## [YYYY-MM-DD] <kind> | <title>` so `grep '^## \[' log.md` produces a readable timeline.

## [2026-06-03] impl | Briefs 32–35 + engine/08 — rendering overhaul, world expansion, WASM expansion, agent activity; pathfinder worker bug fixed

Full visual + world + agent-activity pass. All verified live (Playwright + build clean).

**Critical bug fixed (engine/08):** The WASM pathfinder was loaded in the main render thread but never transferred to the sim worker. `TravelSystem` requires it and was silently skipped — farmers have never actually walked since the Worker migration. Fixed by fetching `/wasm/pathfinding.wasm` in `SimClient.init()`, transferring the `ArrayBuffer` (zero-copy) with the init message, and instantiating `Pathfinder` inside the worker.

**Brief 32 — rendering overhaul:** Y-sort depth ordering replaces flat render queue; drop shadows via `multiply` blend; `ParticleSystem` (coin burst / dirt puff / leaf floats); 54-frame pixel-art atlas redesign; walk/work/idle-bob animations; `action` field on `SnapshotSprite`. Earlier ySquash/depth-scale attempt reverted (genre uses pure orthographic).

**Brief 33 — world expansion:** 11 walkable regions (was 5). Blacksmith (SE, tool upgrades), carpentry (NW, decorations), 4 dedicated resource zones (forest-north/south for trees, quarry-north/south for stones). Tool system: hoe/axe/pickaxe × wooden/stone/iron with durability + upgrade path. Watering can (10 charges, refills at farm fountain). Resource drops (wood/stone/iron-ore/geode). Farm decorations (+10–30% yield, capped +75%). Plot decay 5 days. Home entity per farm. 8 new shared deliberation helpers in `agents/watering.ts`. 1257 walkable tiles.

**Engine brief 08 — WASM expansion:** Three new AssemblyScript modules: `noise.wasm` (value-noise fill, ~8× faster than JS path, wired into ground bake), `rng.wasm` (Mulberry32 batch), `floodfill.wasm` (BFS reachable tiles). All exported from `@engine/core`.

**Brief 35 — player activity:** Slower movement (STEP_TICKS 5→8). `busyUntilTick` — physical actions take 1–3 real seconds based on tool tier. Home/sleep routine — all farmers travel home at evening. Periodic market visit every 3 days. Early village visit day 0–1. Debug player (WASD + P toggle, checks `isWalkable`).

**Brief 31 (corpus sync)** resolved by this update — moved to done.

Corpus: 4 new briefs in `done/`; updated `status.md`, `architecture.md`, `index.md`, `log.md`; moved brief 31 `todo/`→`done/`.

## [2026-06-03] impl | Briefs 24–30 implemented + merged to main; corpus synced

All 7 implementation briefs from the grilling session shipped — built inline one at a time (opus), each tested + verified live with Playwright + headless probes, committed individually, then merged to `main` (`--no-ff`, "Merge briefs 24-30"). Brief 31 is this corpus sync.

**Final state:** 489 tests pass (398 farm-valley + 91 engine); typecheck clean across all workspaces; determinism MATCHes across seeds 0xc0ffee/1/42 at the live `ticksPerDay=1200`.

Per brief (commit → result):
- **24** auction bidding + golden bean — agents bid (per-personality valuation, Vickrey tie-break hardened), bean resells ×3 / gifts for +0.20 trust. Auction duration scaled (×1.5/day) so day-gated agents get a cycle to bid. Live: 20/20 auctions win, 0 no-winner.
- **25** panel overlap — observer + activity feed in a shared fixed right-column flex container.
- **30** ground texture — per-tile value-noise baked into the static layer (engine `bakeStaticLayer(...,decorate?)` hook); seed-deterministic.
- **27** long days — `ticksPerDay` default 20→**1200** (not 6000; that's the documented run-hash-selectable target). Intra-day phases (`PHASE_START`) drive the FSM, new `SLEEP` state, AP refill on morning wake. Final gold IDENTICAL at 20 vs 1200 — macro-economy stayed day-denominated.
- **28** AP economy — `maxApForDay=100+2·day`, sleep-gated (½ unrested), free travel, tiered friend discount, new cost table; fixed `sell-from-wall` cost-0 bug.
- **29** irrigation & crop death — `daysSinceWater` + 2-day grace, rain auto-waters, `CROP_DEATH` event; survival-reflex watering (new `PlotSenseSystem` + `agents/watering.ts`). Agents keep crops alive → ~0 deaths in practice (death unit-tested).
- **26** day/night grading — tick-synced sun curve + seasonal palette wash via engine `endFrame(wash?)`; render-only, sim untouched.

**Two latent bugs fixed in passing:** `EncounterTradeSystem` was never registered after the Worker migration (peer trades + bean gifts were dead live) — now wired in; and `sell-from-wall` silently cost 0 AP.

**Deltas from the specs:** day = 1 min not 5 (watchability/CI; 6000 documented); the warned-of "intra-day rebalancing" did NOT happen (day stayed the economic unit, survival reflexes keep agents productive); crop death rarely fires in normal play (reflex is effective).

Corpus: moved briefs 24–30 `todo/`→`done/`; updated status.md (Now-in-todo → Shipped 2026-06-03 with as-shipped notes + deltas; brief-21 row marked resolved-by-24), open-questions.md (auction gap + the redesign questions → Resolved), index.md (24–30 under a "Shipped" subsection, only 31 left in todo). Not pushed to origin.

## [2026-06-03] briefs | Grilling session — 8 new todo briefs (24–31); auctions found dead-on-field, day/night idea expanded into a long-day gameplay redesign

Reviewed project status, ran the app under Playwright (full 100-day run, seed `0xc0ffee`), researched whether [The Book of Shaders](https://thebookofshaders.com/) fits, then stress-tested 5 improvement ideas via a grilling pass. The 5 grew to 8 briefs as one idea unfolded.

**Playwright findings (live, not in any doc):**
- **Auctions are dead on the field.** 21 of ~22 Activity-feed entries over 100 days read "Auction closed with no winner." Root cause traced: brief 21's auction machinery is correct + tested, but **no agent ever emits an `auction-bid` intention** — the `golden_bean` prize has zero in-sim value. → brief 24. (status.md brief-21 row annotated "Done (machinery) / dead on the field".)
- **Top-right panel overlap.** Observer and event-feed both anchor `top:0; right:0`; the higher-z observer covers the feed. → brief 25.
- **Visual flatness.** Solid-color tiles, no atmosphere, no sense of time across 100 days. → briefs 26 + 30.

**Book of Shaders verdict:** targets GPU GLSL/WebGL and is "all rights reserved"; project is locked to Canvas2D. The *code/tooling does not fit; the math does.* Briefs 26 (color-mix / day-night curve) and 30 (value noise) reimplement its algorithms in JS — no GLSL, no copied code, no Canvas2D revisit.

**The cascade:** "day/night color grading" (cosmetic) → user wanted real Stardew-style long days → wanted agents to live through them (sleep at night, AP penalty) → an AP rework → watering with crop death. A background impact-analysis workflow (5 parallel subsystem probes + synthesis) found the gating blocker: **the agent FSM only advances on `DAY_START`, so "one decision/day" and "all per-day balance rules" are the same invariant** — changing `ticksPerDay` alone does nothing but slow the sim. That split the one idea into **3a/3b/3c/3d**:
- **24** — auction bidding + golden bean (rare/high-resale/giftable; per-personality bids; Vickrey tie-break hardened; `OFFER_BEAN` gift → trust).
- **25** — panel overlap fix (shared right-column flex container).
- **26 (3a)** — render-side day/night + seasonal color wash, tick-synced, season modulates palette + daylight length. Ships with 27 (strobes at the current 1-sec day).
- **27 (3b)** — 1 day = 5 min (ticksPerDay 20→6000); phased intra-day timeline with live re-deliberation + sleep penalty; **macro-economy stays day-denominated** (the one deliberate exception is watering, brief 29).
- **28 (3c)** — AP max 100 (+2/day), sleep-gated (half if unrested), free travel (time-throttled), tiered friend discounts, full cost table + `sell-from-wall` cost-0 bug fix.
- **29 (3d)** — watering required; grace-windowed dryness (`daysSinceWater`); rain auto-waters; crops die after 2 dry days; survival-reflex watering per personality.
- **30** — subtle per-tile value-noise on the baked static layer.
- **31** — this corpus sync.

**Dependency chain:** 24 & 25 independent (ship first) · 26 ships with 27 · 27 → 28 → 29 (strict) · 30 & 31 independent. **27–29 are a real gameplay redesign** — briefs 01–23 were built against one-decision-per-day; expect rebalancing.

**Determinism/save notes captured in the briefs:** old shared run URLs survive the `ticksPerDay` default change (it's field 3 of the run hash; hash value preferred over default); any new sim-affecting intra-day param must version the run descriptor with backward-compatible parsing.

Corpus sync (brief 31): fixed `index.md` — briefs 06 + 16–22 were stale-listed under "todo" headers (and linked to `todo/` paths) though they shipped to `done/`; moved them to the done listings and registered 24–31 under todo. Updated status.md, open-questions.md. No source changed.

## [2026-05-29] impl | Final brief swarm — all 8 remaining todos shipped, `todo/` now empty

Cleared every remaining brief in one orchestrated swarm. Each brief was implemented by an isolated worktree subagent on its own `feat/<NN>-<slug>` branch, then rebased onto current `main` and merged (`--no-ff`) by the orchestrator. Briefs grouped into waves by file-overlap to avoid `main.ts`/observer/snapshot conflicts (user chose "grouped batches").

- **Wave 1 (parallel, disjoint files):** `21-complete-auctions` (English+FPSB), `06-determinism-harness` (run-sim CHECK_DETERMINISM + EXPORT modes + sim-bootstrap.test.ts guard), `22-seasons-weather-arcs` (4×25-day seasons biasing the weather draw + observer header).
- **Wave 2 (serialized, shared `main.ts`/observer/worker-snapshot):** `19-decision-trace` (focused-farmer "why"), `18-seed-picker` (home-screen seed + Randomize), `17-save-replay` (run-descriptor URL share/load), `16-playback-controls` (pause/speed/step as worker control messages), `20-event-feed` (read-only snoop → snapshot → panel).

**Worktree-base gotcha:** the harness created worktrees from a *stale* commit (`4402790`, pre-Web-Worker move) rather than current `main`. Wave-1 agents implemented against the old layout — auctions/determinism rebased cleanly, but `22-seasons` had put its observer plumbing in the old inline `main.ts` `buildObserverSnapshot`, which the worker move had relocated to `worker/snapshot-builder.ts`. Orchestrator resolved the rebase: took `main`'s worker-based `main.ts`, re-applied the `season` field in `worker/snapshot-builder.ts`. The `06` rebase also restored the shock narrator that the agent's pre-shock base had dropped from run-sim's default mode. Wave-2 agents were told to `git rebase main` first and did so cleanly.

**Determinism:** verified MATCH across seeds 0xc0ffee/1/42 over the full 100-day run after all merges. Playback/seasons/auctions/trace all deterministic (tick-count-driven, no wall-clock/random in sim).

Final: **446 tests pass** (355 farm-valley + 91 engine), typecheck clean across farm-valley/engine/run-sim. All 8 briefs moved `todo/` → `done/`.

## [2026-05-29] impl | Open-questions round — 5 fixes landed on feature/open-questions-round

Went through every open question with the user and implemented their choices, one commit per item on branch `feature/open-questions-round` (not yet merged/PR'd):

1. **act.ts buy-seed → bus** (`2233a15`). Removed the direct slate-mutation shortcut; `buy-seed` now emits `ONT_SHOP.SELL`, handled by `ShopkeeperSystem.handleSell`. Accepted determinism shift (seed lands ~1 tick later). User chose full bus routing over a sync shared-helper refactor.
2. **Pathfinder verify + docs** (`1793ac6`). Audit found it was already load-bearing (not idle, as the stale docs claimed). Added a game-grid around-obstacle test; corrected architecture.md. Brief engine/05 → done.
3. **Cached static backdrop** (`a8e0c0b`). `Canvas2dRenderer.bakeStaticLayer` bakes tiles+fences+plot-dirt once; dynamic sprites stay per-frame. User opted to build it now rather than wait on the profile gate. Brief engine/07 → done.
4. **Mid-game shock** (`7699993`). Direction B of brief 23: a deterministic one-time blight on the run midpoint, targeting a crop-holding farmer so it always lands. Brief game/23 → done. Standings shifted (Atticus 2298→2018 at the default seed) — expected.
5. **Sim → Web Worker** (`2ed2a4d`). Sim runs in a Worker posting RenderSnapshots; main thread interpolates + renders. postMessage only (no SAB). Determinism verified (`npm run sim` byte-identical) and browser-verified (focus camera, halo, panels, no errors). Implemented by a sonnet subagent against an opus-authored snapshot schema; opus verified.

Brief game/19 (BDI "why" trace) was kept as a todo (user chose lightweight-as-briefed, deferred implementation). Final: 379 tests pass (288 farm-valley + 91 engine), typecheck clean.

Also folded in earlier same-day housekeeping that hadn't been committed: the 11 improvement briefs (game 16–23, engine 05–07), the world-preview rewrite to the real 40×40 world, and the stale-trust-comment cleanup.

## [2026-05-29] brief | 11 improvement TODOs drafted (game 16–23, engine 05–07)

Engine/game review surfaced gaps between stated capability and shipped experience; drafted 11 task briefs to track them. None implemented yet — all in `todo/`.

**Game (`briefs/game/todo/`):**
- **16-playback-controls** — pause / speed (1×/2×/4×) / step. Highest experience-per-effort: it's a watch-only game with no time control today. Presentation-only; must stay byte-identical to an uninterrupted run for the same seed.
- **17-save-replay** — ship the save/replay model the architecture already promises ("seed + event-sourced input log"). `InputLog` is currently instantiated and discarded (`void inputLog;` in main.ts). Adds a shareable run URL.
- **18-seed-picker** — choose/randomize the seed on the home screen (it's hardcoded `0xc0ffee`). Pairs with 17.
- **19-decision-trace** — the deferred BDI "why". Brief 11's focus mode (the stated trigger to revisit) shipped, so this is now actionable. Lightweight intention+reason, not a full log.
- **20-event-feed** — activity ticker narrating trades / auctions / weather by snooping the bus read-only (TrustSystem/MeetIndicator precedent). Highest narrative payoff.
- **21-complete-auctions** — implement English + FPSB. Today they're stubs in auction.ts that route through a Vickrey shell and always return null winners; Vickrey + Dutch work.
- **22-seasons-weather-arcs** — season cycle biasing weather/yields, giving the 100-day run a shape. Depth brief.
- **23-fifth-personality-or-shock** — variance injector, **design-gated** (preserves "no balance work, moments matter"). Pick a 5th personality or a mid-game shock at activation.

**Engine (`briefs/engine/todo/`):**
- **05-pathfinder-into-movement** — make the WASM pathfinder load-bearing in travel, or document straight-line and remove dead plumbing. Closes the "loaded but unused" gap.
- **06-determinism-harness-and-analytics** — enforce the determinism guarantee in CI (run-twice-and-diff) + per-day CSV/JSON export from run-sim. Protects the foundation 17/18/20 depend on.
- **07-chunked-tile-layer** — cached/chunked backdrop render pass, **profile-gated**: the brief's first step is measuring whether the per-tile backdrop is actually hot before any code. Canvas2D stays locked (no WebGPU revival).

Corpus updates: cataloged all 11 in [index.md](index.md); restructured [wiki/open-questions.md](wiki/open-questions.md) so the tilemap / decision-trace / fifth-personality / pathfinder questions now point at their briefs, and re-surfaced the `act.ts` buy-seed bypass as a still-untracked code gap.

## [2026-05-29] fix | typecheck unblocked + world-preview rewritten to the real world

Edge-tooling cleanup after an engine review. `npm run typecheck` was red across the monorepo: `tools/world-preview` imported the deleted `farm-valley/src/decorate`. Rewrote [tools/world-preview/src/index.ts](../../tools/world-preview/src/index.ts) to render the real 40×40 region world — reads layout from the shared `world/regions.ts` (single source of truth), boots the actual sim via `bootstrapSim`, and mirrors `render-systems.ts` backdrop/fence/plot/sprite logic (it had been rendering a stale hardcoded 20×12 layout). Also removed two stale `// TODO: real trust updates land in a future ticket` comments in hoarder.ts / opportunist.ts (trust landed in Brief 10) and gitignored the generated `world-preview.png`. Typecheck green; 355 tests still pass.

## [2026-05-26] impl | Briefs 11–15 landed: viewer upgrade + visual polish

Five briefs spec'd from the design interview ("watch BDI with tension via moments") landed via 5 parallel sonnet subagents in 5 worktrees. Locked decisions from the interview: focus camera + free pan; visual emphasis + current/next intention; moments-driven tension with ambient leaderboard; smallest first slice = viewer upgrade. The user said "all of them, separated todo" and 5 worktrees were spun up at once.

- **11-focus-camera**: Click an observer row to follow that farmer (gold halo, gold row outline, Reset View button). Free pan (mouse drag) + scroll-wheel zoom (0.5×–3×). `Camera2D` gained `setCenter` / `setZoom` setters (the only engine change in this round).
- **12-live-leaderboard**: New `LeaderboardPanel` (bottom-left) updates each render frame using the existing `leaderboard(world)` from `sim-bootstrap.ts`.
- **13-walking-animation**: 8 new atlas recipes (4 personalities × walk-a / walk-b) and a `pickFarmerFrame(entity, tick)` helper. Two-tick phase flip while `farmer.path` is set; reverts to idle on arrival.
- **14-meet-indicator**: New `MeetIndicatorSystem` (snoops farmer inboxes, not the bus, because `EncounterSystem` writes directly to inboxes). New `indicator/meet` speech-bubble atlas frame. `iterateMeetIndicators` generator in render-systems.ts renders the bubble above each active farmer for 10 ticks.
- **15-slate-billboard**: New `SlateBillboardPanel` (bottom-right) reads `shopkeeper.dailySlate` each frame, shows `[crop] [price]g · [remaining]/[total] left` rows.

Merge story: serialized merges to main. 15 + 12 conflicted on `main.ts` (panel instantiation lines) and `ui/index.ts` (re-exports) — both trivial additive. 14 auto-merged. 13 conflicted on `render-systems.ts` (sprite loop signature), `main.ts` (buildCanvasFrame call), and binary atlas artifacts (resolved by re-running `npm run atlas`). 11 conflicted on the same `render-systems.ts` + `main.ts` lines; final `buildCanvasFrame` signature became `(renderer, world, alpha, tick, meetIndicators, focusedFarmerId)`. 264/264 farm-valley tests pass on main.

Live verification via Playwright: focus camera works (clicking Hannah shifts the camera south, her row gets the gold outline), MEET indicator visible as a white "!" bubble over co-located farmers, leaderboard updates throughout the run (Hannah was #1 at day 3 with 111g, Atticus the eventual day-100 winner at 2086g), slate billboard renders live and `radish 16/17 left` confirms `act.ts` is genuinely consuming from the slate (Brief 08's path through `act.ts` is now exercised in-game, not just in tests).

Screenshot: [media/farm-valley-polish.png](../../media/farm-valley-polish.png).

## [2026-05-26] impl | Follow-up gaps closed (slate-in-act, cnp-registry, responder-trust)

Three short cleanup briefs landed via three parallel sonnet subagents (no opus planner — orchestrator-planned, sonnet-executed). Worktrees: `feature/slate-in-act`, `feature/cnp-registry`, `feature/responder-trust`. All three merged to main; 238/238 farm-valley tests pass.

- `slate-in-act` (commit `bac5499`): ActSystem.buy-seed now consumes from `shopkeeper.dailySlate` via a shared `consumeFromSlate(slate, crop, qty, { dryRun? })` helper in `agents/shop-slate.ts`. `ShopkeeperSystem.handleSell` refactored to use the same helper. The hardcoded `SEED_COST` table in `act.ts` is gone. Slate's stock + price variance are now load-bearing in the running game.
- `cnp-registry` (commit `7e8da0a`): Extracted the per-farmer `CnpCoordinator` map from `hoarder.ts` into a new `agents/cnp-registry.ts` module with `getOrCreateCoordinator` + `listCoordinators`. `sim-bootstrap.ts` passes `listCoordinators()` to `TrustSystem`, so broken-commitment trust deltas now fire in running games (previously `cnpCoordinators: undefined`).
- `responder-trust` (commit `2d606f8`): When `EncounterTradeSystem.handleOffer` returns `decision: "accept"`, the acceptor applies `+0.05` trust toward the sender directly via the exported `applyTrustDelta`. The trust matrix is fully live.

Verified end-to-end in Playwright: dev server boots, 4 farms + village render, farmers travel and the Region column flips between `home` / `village` / `traveling`, day 100 leaderboard fires with Atticus's end-of-sim liquidation reflected (`Region: traveling`, `unsold: 0`). Screenshot saved at `media/farm-valley-final.png`.

Tracked PNGs moved from repo root to `media/` (README updated).

## [2026-05-26] reorg | Adopt LLM Wiki pattern

Reorganized the corpus from a flat `engine/todo/` + `game/todo/` layout into the three-layer wiki pattern:
- `briefs/` for raw historical task specs (was `engine/` and `game/`)
- `wiki/` for LLM-curated synthesis pages
- `CLAUDE.md` schema, `index.md` catalog, this `log.md`

Added: [wiki/overview.md](wiki/overview.md), [wiki/architecture.md](wiki/architecture.md), [wiki/decisions.md](wiki/decisions.md), [wiki/open-questions.md](wiki/open-questions.md). Migrated `STATUS.md` → [wiki/status.md](wiki/status.md) and split its "Open gaps" section into [wiki/open-questions.md](wiki/open-questions.md).

## [2026-05-26] impl | Briefs 08 + 09 + 10 landed in parallel worktrees

Three feature branches (`feature/shop-slate-sales`, `feature/peer-meet-trades`, `feature/trust-and-endgame`) dispatched as parallel background opus subagents per the new opus-plans-then-sonnet-executes pattern. Two of the three opus subagents discovered the nested-Agent-tool wasn't loaded in their sandbox and inlined their implementations; one (Brief 10) got blocked partway when the classifier flagged the policy-divergence. I (orchestrator) took over the verify/finish step for 09 and 10, ran typecheck + tests, then merged all three to main.

218/218 farm-valley tests pass on main after all three merges. Auto-merge resolved the overlap in `aggressive.ts` between briefs 09 (peer-trade respond hook) and 10 (end-game liquidation) — different sections of the file, no conflict markers needed.

Closed gaps that were in [open-questions.md](wiki/open-questions.md):
- Shop slate is consumed by trades (brief 08).
- MEET messages drive real gameplay via peer seed trades (brief 09).
- Trust scores update on encounter and CNP outcomes (brief 10).
- Aggressive liquidates in the last 2 days (brief 10).

New / surfaced gaps:
- `act.ts` has a direct-mutation `buy-seed` path that bypasses `ShopkeeperSystem.SELL`, so brief 08's slate-driven path is currently only exercised by tests. Follow-up: route `buy-seed` through the bus.
- The CNP coordinator registry lives inside `hoarder.ts` as a private const; TrustSystem accepts `cnpCoordinators: undefined` at construction today. A small refactor exposing the registry will activate broken-commitment trust deltas in the running game.

Process note: the nested-Agent-tool issue is real and recurring — the saved subagent workflow ("opus plans → sonnet executes") only works if the subagent dispatch tool is loaded in the planner's environment. Two paths forward: (a) preload `Agent` in subagent prompts, or (b) accept opus inlining as the fallback. Today's run used (b) successfully for 08 and 09.

## [2026-05-26] impl | Brief 07 landed — renderer caught up to the new world

Brief 07 implemented on `feature/render-regions` by a single senior (opus) subagent. Game now renders the 40×40 tile world: grass for farms, dirt for the village, path tiles for roads, fence perimeters around each farm. All `Transform.{x,y}` are now in tile units; renderer converts at draw time. `decorate.ts` deleted. Observer panel gained a region column (home / village / traveling / `<peer-farm>`). 159/159 farm-valley tests pass; production build green.

Tile size = 16; camera covers full 640×640 world (zoomed-out always-on view as decided in Briefs 05/06).

Subagent note: the brief said "must not touch `region-setup.ts`" but the senior had to add sprite stamping for market wall + shopkeeper there once `decorate.ts` was deleted (decorate.ts was providing both the pixel-coord override AND the sprite component). Reasonable judgment call — flagged in their report.

## [2026-05-26] process | Subagent workflow change

Going forward, implementation work uses **opus-plans-then-sonnet-executes** instead of the parallel opus+sonnet pattern used for Briefs 05/06. The senior plans (reads brief, surveys code, writes concrete step-by-step plan including exact diffs and tests), then dispatches one sonnet to execute the plan. Cheaper, more predictable, fewer scope drifts. Saved to memory.

## [2026-05-26] impl | Briefs 05 + 06 landed via parallel subagents

Brief 05 (`0c50acd`) and Brief 06 (`e45c7d7`) implemented on branch `feature/village-farms` using paired senior (opus) + junior (sonnet) subagents per brief, working in one shared worktree at `.claude/worktrees/village-farms`. 157/157 farm-valley tests pass. Both briefs moved to `briefs/game/done/`.

Worked as expected:
- The senior/junior file-ownership split in the briefs gave both subagents non-overlapping scopes and they ran cleanly in parallel.
- The WASM pathfinder is now load-bearing: personalities prepend a `travel → village` intent before any market action when they're not already there. TravelSystem consumes those and walks farmers tile-by-tile (STEP_TICKS=5).

Divergences from the briefs worth noting:
- Walkable tile count was 752, not 728 — my arithmetic in Brief 05 was off (4×144 + 144 + 32 = 752). Test asserts the correct count.
- Senior found that the "flat plot loop" the brief said to remove from `world-setup.ts` actually lived in `sim-bootstrap.ts`. They pragmatically extended scope to `sim-bootstrap.ts` and replaced it there. Reasonable call.
- `System.run(ctx)` was used everywhere (not `step(stepMs)` as the briefs sketched) — the senior caught this from existing code. Codebase wins, per [CLAUDE.md](CLAUDE.md).
- Brief 06's "ShopkeeperSystem consumes from `remaining` and rejects sold-out trades" wasn't implemented because my junior prompt forbade touching `shopkeeper.ts`. The slate is generated and broadcast but trades still hit the existing fixed-price handlers. See [wiki/open-questions.md](wiki/open-questions.md).
- No renderer changes yet — the new 40×40 region layout is invisible until the canvas2d renderer is taught about regions. Tracked in open-questions.

## [2026-05-26] brief | 05-village-and-farms + 06-spatial-market drafted

Spatial restructure: 4 farms (N/E/S/W) + village center with shop and town square. Decisions made:
- World view: all 5 regions on one zoomed-out canvas (one continuous map, no scene transitions)
- Spatial coupling: posting offers + peer trades require presence in village; reading stays remote
- Shop: daily slate of 5 offers, ±10–20% off baseline, mix of buy/sell

Brief 05 (foundation) covers regions, walkable grid, pathfinder integration, travel intent + TravelSystem. Finally puts the WASM pathfinder to work — closes [open-questions.md](wiki/open-questions.md) "Pathfinder loaded but unused."

Brief 06 (depends on 05) layers in market presence enforcement, peer encounter trades, shop daily slate, and updates personalities to plan trips. Trust score gap from Brief 01 still deferred.

## [2026-05-26] status | Brief sweep + post-corpus work documented

Audited all 8 task briefs against the codebase. 7 of 8 are **done**; `01-tilemap` is **superseded** (WebGPU dropped for Canvas2D in commit `5ac7f8d`). Recorded post-corpus work that never had a brief: Canvas2D renderer, in-house ECS replacing miniplex (`020406d`), WASM pathfinding infrastructure, home screen, headless `run-sim`, `world-preview`. See [wiki/status.md](wiki/status.md).
