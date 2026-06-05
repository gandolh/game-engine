# Project Status

Current-state snapshot (as of **2026-06-05**). One terse line per brief; full per-brief detail lives in the brief files and the chronological [log.md](../log.md). All engine briefs (01–08) and game briefs (01–47) are in `done/`/`superseded/`; only game briefs **45, 46** remain in `todo/`. Player/interaction work (Pip) shipped without briefs — see [player-and-interaction.md](player-and-interaction.md).

> **Compaction note (2026-06-05):** this page was rewritten from a long shipping history into a snapshot. The blow-by-blow (test counts, per-brief implementation notes, batch narratives) now lives only in [log.md](../log.md); this page keeps the *current* status + the durable "how the sim behaves now" summary.

## Engine briefs — all Done/Superseded

| Brief | Status |
|---|---|
| [01-tilemap](../briefs/engine/superseded/01-tilemap.md) | **Superseded** — WebGPU dropped; Canvas2D took over. |
| [02-input](../briefs/engine/done/02-input.md) · [03-tests](../briefs/engine/done/03-tests.md) · [04-spatial-anim](../briefs/engine/done/04-spatial-anim.md) | **Done** — input, engine test suites, spatial hash + animation. |
| [05-pathfinder-into-movement](../briefs/engine/done/05-pathfinder-into-movement.md) | **Done** — WASM pathfinder confirmed load-bearing in `TravelSystem`. |
| [06-determinism-harness-and-analytics](../briefs/engine/done/06-determinism-harness-and-analytics.md) | **Done** — `CHECK_DETERMINISM=1` (MATCH/DIVERGE) + `EXPORT=csv\|json` in run-sim. |
| [07-chunked-tile-layer](../briefs/engine/done/07-chunked-tile-layer.md) | **Done** — `bakeStaticLayer` bakes the backdrop once; chunking unneeded. |
| [08-wasm-expansion](../briefs/engine/done/08-wasm-expansion.md) | **Done** — noise/rng/floodfill WASM; fixed the never-transferred-pathfinder bug (farmers now move). |

## Game briefs — all Done (45, 46 still todo)

Foundational (01–23): personalities, weather/crops, market/shop, observer UI, regions + travel, spatial market, render, slate sales, peer trades, trust + endgame, focus camera, leaderboard, walk/meet/slate UI, playback controls, save/replay, seed picker, decision trace, event feed, complete auctions, seasons, mid-game shock. All **Done** — see each brief in [../briefs/game/done/](../briefs/game/done/).

| Brief | Status | One-line |
|---|---|---|
| [24-auction-bidding-golden-bean](../briefs/game/done/24-auction-bidding-golden-bean.md) | **Done** | Agents bid; `golden_bean` valuable (resell/gift). Fixed the "no winner" dead auction. |
| [25-panel-overlap-fix](../briefs/game/done/25-panel-overlap-fix.md) | **Done** | Observer + feed share one right-column flex container. |
| [26-day-night-seasonal-grading](../briefs/game/done/26-day-night-seasonal-grading.md) | **Done** | Render-side day/night + seasonal wash (tick-synced, sim untouched). |
| [27-long-days-intraday-timeline](../briefs/game/done/27-long-days-intraday-timeline.md) | **Done** | `ticksPerDay` 20→1200; intra-day phases + SLEEP; economy stays day-denominated. |
| [28-ap-economy-rework](../briefs/game/done/28-ap-economy-rework.md) | **Done** | AP `100+2·day`, sleep-gated, free travel, friend discounts. |
| [29-irrigation-crop-death](../briefs/game/done/29-irrigation-crop-death.md) | **Done** | Watering required (2-day grace); rain auto-waters; survival-reflex keeps deaths ~0. |
| [30-procedural-ground-texture](../briefs/game/done/30-procedural-ground-texture.md) | **Done** | Per-tile value-noise baked into the static layer. |
| [32-rendering-overhaul](../briefs/game/done/32-rendering-overhaul.md) | **Done** | Y-sort, shadows, particles, walk/work/idle-bob, bigger atlas. Orthographic confirmed. |
| [33-world-expansion](../briefs/game/done/33-world-expansion.md) | **Done** | 11 regions, tool system, watering can, resource drops, decorations, plot decay. |
| [35-player-activity](../briefs/game/done/35-player-activity.md) | **Done** | Slower movement, action time cost, home/sleep routine, market visits, debug player. |
| [36-end-of-run-recap](../briefs/game/done/36-end-of-run-recap.md) | **Done** | Day-100 "Legends" recap; passive `RunHistorySystem` + pure `summarizeRun`. |
| [37-rivalries-and-relationship-legibility](../briefs/game/done/37-rivalries-and-relationship-legibility.md) | **Done (DORMANT)** | Relationship matrix + `RivalrySystem`. Correct + tested but inert — peer events never fire (see balance below). |
| [38-drama-scoring-and-narrative-escalation](../briefs/game/done/38-drama-scoring-and-narrative-escalation.md) | **Done** | Per-event `drama` (pure `drama.ts`, act-band weighted) → feed ★ emphasis, rank-flip/race-on lines, recap headline. |
| [39-wealth-over-time-graph](../briefs/game/done/39-wealth-over-time-graph.md) | **Done** | Multi-line wealth chart + crossings; live `wealthSeries` on the snapshot. Render-only. |
| [40-thought-bubbles-and-highlight-skip](../briefs/game/done/40-thought-bubbles-and-highlight-skip.md) | **Done** | Intention bubbles (on-change) + `skipToHighlight` (H) + feed-click-to-zoom. *Completes spectator layer 36–40.* |
| [41-crop-roster-and-quality-tiers](../briefs/game/done/41-crop-roster-and-quality-tiers.md) | **Done** | 8 season-gated crops + Normal/Silver/Gold quality (husbandry + forked rng); quality-weighted net worth. **The spine.** |
| [42-livestock-and-orchards](../briefs/game/done/42-livestock-and-orchards.md) | **Done — fires live** | Coops/barns (care→product) + perennial orchards. First lead crossing: Cora's patient-capital beats the aggressive runaway. |
| [43-greenhouse-and-farm-skill-progression](../briefs/game/done/43-greenhouse-and-farm-skill-progression.md) | **Done — fires live** | Season-immune greenhouse + 4 per-farm skills. Greenhouse doesn't amortize in 100d; skills lopsided to farming. |
| [44-living-world-working-npcs-and-tavern](../briefs/game/done/44-living-world-working-npcs-and-tavern.md) | **Done — fires live** | Carpenter fulfills real commissions; blacksmith consumes materials; tavern (gossip + hire-help + gathering); notice-board demand. |
| [45-seasonal-visual-identity-and-festivals](../briefs/game/todo/45-seasonal-visual-identity-and-festivals.md) | **Todo** | Season tiles + rain/snow particles + festival days. |
| [46-harbor-shipping-and-contracts](../briefs/game/todo/46-harbor-shipping-and-contracts.md) | **Todo** | Harbor + time-boxed contracts + reputation (demand-side axis). |

## Current sim behaviour & determinism

- **Tests/typecheck:** as of brief 44 the suite is green (607 farm-valley + 60 engine = **667**); typecheck clean. (Latest counts always in the newest [log.md](../log.md) entry — not tracked here.)
- **Determinism:** load-bearing and verified `MATCH ×3` (seeds `0xc0ffee/1/42`) after every brief via `CHECK_DETERMINISM=1`. Briefs **41–44 re-baselined outcomes by design** (new crops/quality/livestock/greenhouse/NPCs) — the contract is *same seed reproduces itself*, NOT equality to pre-41 numbers.
- **Headless-probe pitfall:** a headless `bootstrapSim` check must pass `pathfinder: new JsPathfinder()`, or `TravelSystem` is omitted and every travel-gated action (build/buy/plant/commission) silently no-ops — falsely reading as "dormant". (This caught a false dormancy on brief 42.)
- **Leader-runaway / dormancy (the live-drama gap):** through brief 41 one farmer (Atticus/aggressive) ran away wire-to-wire, so the spectator layer (37/38/39/40) had no live drama to surface. **Brief 42 produced the first real lead crossing** (Cora's livestock play overtakes Atticus) — but 43 (greenhouse capital doesn't repay in 100d) and 44 (tavern/hiring are flush-only sinks) let the runaway return. Skills (43) are lopsided to farming since the AI rarely forages/fishes/mines. The **peer-interaction layer is inert** (37): no farmer↔farmer trades/declines fire, so `farmer.trust` never leaves 0.5 and no rivalry forms. Net: drama features are correct + tested but only intermittently lit live; a future balance/rivalry brief (rubber-banding, or peer interaction) would activate them. Full detail in [open-questions.md](open-questions.md).

## Post-corpus work (no brief)

Canvas2D renderer (replaced WebGPU), in-house ECS (replaced miniplex), WASM pathfinding infra, sim-in-a-Web-Worker (snapshot/interpolate boundary), home screen, headless run-sim, offline world-preview, README. The playable farmer **Pip** + interaction systems (hotbar, tooltips, feature collision, bridges, 88×80 archipelago, fishing) — full synthesis in [player-and-interaction.md](player-and-interaction.md).

## Open gaps

See [open-questions.md](open-questions.md) for the live list.
