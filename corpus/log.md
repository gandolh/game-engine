# Corpus Log

Append-only chronological record. Each entry starts with `## [YYYY-MM-DD] <kind> | <title>` so `grep '^## \[' log.md` produces a readable timeline.

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
