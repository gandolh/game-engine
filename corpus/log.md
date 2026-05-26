# Corpus Log

Append-only chronological record. Each entry starts with `## [YYYY-MM-DD] <kind> | <title>` so `grep '^## \[' log.md` produces a readable timeline.

## [2026-05-26] reorg | Adopt LLM Wiki pattern

Reorganized the corpus from a flat `engine/todo/` + `game/todo/` layout into the three-layer wiki pattern:
- `briefs/` for raw historical task specs (was `engine/` and `game/`)
- `wiki/` for LLM-curated synthesis pages
- `CLAUDE.md` schema, `index.md` catalog, this `log.md`

Added: [wiki/overview.md](wiki/overview.md), [wiki/architecture.md](wiki/architecture.md), [wiki/decisions.md](wiki/decisions.md), [wiki/open-questions.md](wiki/open-questions.md). Migrated `STATUS.md` → [wiki/status.md](wiki/status.md) and split its "Open gaps" section into [wiki/open-questions.md](wiki/open-questions.md).

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
