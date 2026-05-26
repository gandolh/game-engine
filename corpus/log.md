# Corpus Log

Append-only chronological record. Each entry starts with `## [YYYY-MM-DD] <kind> | <title>` so `grep '^## \[' log.md` produces a readable timeline.

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
