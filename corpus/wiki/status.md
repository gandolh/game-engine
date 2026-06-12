# Project Status

Current-state **snapshot** (2026-06-12). Terse one-liner per brief here; full implementation detail lives in each brief file ([briefs/](../briefs/)), recent passes in [log.md](../log.md) (older entries trimmed → git history), live design gaps in [open-questions.md](open-questions.md).

**Where things stand:** engine briefs **01–16** and game briefs **01–88** are **Done or Superseded**. **todo/:** [85-animation-engine](../briefs/game/todo/85-animation-engine.md) (reintroduce the `AnimationClip`/`Animator` primitive **with consumers** + an action swing; render-only — see [wiki/animation.md](animation.md)) · [89-detailed-characters-and-held-tools](../briefs/game/todo/89-detailed-characters-and-held-tools.md) (detailed 24×24 characters + held hotbar tool; design agreed, awaiting build sign-off; render-only).

**Improvement backlog shipped 2026-06-12** (filed and implemented the same day — one worktree branch per brief, Sonnet executors, merged to main individually, tests + typecheck green after every merge):
- **Engine 10** WASM allocator fault — root cause: the TS wrapper freed `gridPtr` before `outPtr`, but the AS **stub bump allocator only reclaims the most-recent allocation**, so ~25.6 KB leaked per `findPath` (160×160 grid) → heap exhausted at ~655 calls → `unreachable`. Fix is a two-line free-order swap in [pathfinder.ts](../../packages/engine/src/wasm/pathfinder.ts) + an 800-call churn regression test (red pre-fix). TravelSystem's per-intent catch kept but loudened to `console.error`. **Fast diff MATCH ×6** (seeds 0xc0ffee/1/42 × ticks 20/1200), and 3-day output is **byte-identical to pre-fix main** (the leak never bit in short runs) — no baseline move.
- **Engine 11** WGSL validation guard — `wgsl_reflect` 1.4.0 (pinned devDep) parses every `*.wgsl` in [wgsl-lint.test.ts](../../packages/engine/src/render/webgpu/shaders/wgsl-lint.test.ts) (globbed, with throw-fixtures proving it bites); the reserved-keyword regex scan is **kept** — the parser does not catch that class (the original black-screen incident).
- **Engine 12–16** shader wave (all render-only, EDG-safe by construction): **12** GPU day/night tint pass (`tint.wgsl`/`tint-pass.ts`; wash off the 2D overlay, which keeps only the Canvas2D fallback jobs; later passes compose under it) · **13** living water (cell-hash tiling break + value-noise UV-warp + step()-quantized shore foam + Voronoi caustics, masked by an R8 depth-mask texture built game-side from water-depth data) · **14** weather/particle parity (round SDF snow, rain-streak tail taper, per-flake hash variation, true 8-point star, shaped fade; CPU particle pool capped at 512 + swap-remove; ring splashes skipped — no GPU splash instances exist) · **15** fBm cloud-shadow pass, world-anchored, weather-driven coverage (sunny 0.06 → storm 0.72) · **16** per-instance vertex wind sway for crops/trees/bushes (top-vertex shear, deterministic per-tile phase, global gust knob; bridge rope kept its richer two-sine CPU sway).
- **Game 86** juice — pooled DOM gold popups (per-kind caps), trauma² screen shake (≤3 px, post-smoothing offset, positive beats only), 2–4-frame hitstop via `SimClient.freezeInterp` (snapshot consumption untouched), leaderboard score-bump (easeOutBack), drama-weighted intensity, and a resync/H-skip cursor guard so stale events never replay as a popup burst. 30 new jsdom tests.
- **Game 87** home/forge-house Stardew restyle — `home` corrected 16×16→32×48 (tests already treated it as 32×48), `forge-house` re-trimmed with chimney kept at the same pixels (`FORGE_CHIMNEY_PX` anchor verified); only the buildings sheet rebuilt (rest cached, brief-71 invariant held).
- **Game 88** real-VPS deploy — **closed without code: the user executed the deploy on real hardware and confirmed it works.**

⚠️ **Pending:** an in-browser visual pass over 12–16/86/87 (WebGPU can't render headless on this box) — see each done-brief's acceptance list for what to eyeball. [83-visual-depth-polish](../briefs/game/done/83-visual-depth-polish.md) is **Done** (user-confirmed visuals, 2026-06-12): granular near-shore water, sandy-shore descent, sagging bridge guard-rope with organic sway, procedural WebGPU water, and the Stardew restyle of all 5 cottages (the `home`/`forge-house` leftover closed by brief 87 above). The game is **WebGPU-only** (`farm-valley` forces the backend; Canvas2dRenderer kept in `@engine/core` for tests); the `webgpu-migration` branch was fast-forward-merged into `main` (2026-06-12). The old "WGSL isn't validated by tsc/vitest" gotcha is now mitigated by the brief-11 parser guard. Tests + typecheck green (one atlas cache test times out on constrained hardware while the dev server runs — environmental). **No open threads.**

*Resolved 2026-06-12 — **Tier-0 FPS regression** (brief 84): NOT reproducible on real hardware. A user real-GPU `?profile` export (`ANGLE / AMD Radeon`) shows **99 fps, `frame` JS 5 ms** — the old "15–30 fps" was a headless-SwiftShader (CPU-raster) artifact. Shipped: `DEFAULT_ZOOM = 2` (framed-in opening shot, kept by user choice; perf value now insurance for weak GPUs/high-DPI) + a `?profile` profile-export button (`window.__exportProfile()` + WebGL GPU-identity probe). No GPU-overdraw work needed. See [performance.md](performance.md) Tier 0.*

*Resolved 2026-06-12 — **Movers teleport** (brief 82): the `interpolate` flag was farmer-only, so work NPCs snapped tile-to-tile. Fixed by widening the flag to work NPCs + a 2-tile teleport clamp in the client lerp path. Render-only, no baseline move. (Livestock/boats/ambient were ruled out by code-reading — they don't tile-step.)*

*Resolved 2026-06-12 — **AI fishing broken** (brief 80): `FISHING_CAST_TILES` was already converted from the stale off-isle literal to a `deriveFishingCastTiles()` scan of the live isle bounds in commit `672cccd` (brief just wasn't closed). Verified + closed: live-world guard test passes and a new `fishing.test.ts` confirms `deliberateFishing` fires to a valid cast tile. Baseline already moved at `672cccd`, not this session.*

## Recent briefs (one-liners; detail in log.md)

**66–79 — shipped 2026-06-11 (Opus-plan / Sonnet-execute, committed per-brief):**
- **66** tab-resync — `SimClient` drops the straddling snapshot pair on tab-hide, resets the interp clock on show (render/transport).
- **67** pixel-snap + camera smoothing — engine `expSmooth` + `Canvas2dRenderer.pixelSnap`; lock-follow with glide-on-jump (render-only, bake byte-identical).
- **68** ambient idle life — seeded `AmbientLayer` (birds/leaves/chimney smoke), capped pools, no `Math.random` (render-only).
- **69** named system stages — `scheduler.stage()` labels + opt-in same-stage read/write bus audit; flattened order byte-identical (order-pin test).
- **70** startgold +30 uniform — cash constraint lifted (zero `would-breach-reserve`); ⚠️ baseline moved (reproducibility ×3); 15-day-close target unmet (gate is stock/encounters, not gold).
- **71** per-asset atlas recipes — recipe monolith → one file per asset + hash-cached per-sheet builds (`0 built, 6 cached` on a clean tree); see [asset-pipeline.md](asset-pipeline.md).
- **72** shared-run lobby server — `RunRegistry`: one `SimHost` per run-key, encode-once fan-out, owner-only control, late-join replay, zero-socket reaping. Determinism untouched.
- **73** travel-reachability guards — build-time connectivity-component map + gather-beat reachability guards; root cause was `TAVERN_GATHER_TILE`/`FESTIVAL_PODIUM_TILE` pointing at OCEAN in the radial world. ⚠️ baseline moved. Task 4 (WASM allocator fault) deferred.
- **74** weather-station island — new bridged `landmark`-kind region + building/antenna/beacon (render; ⚠️ may move baseline).
- **75** economy rebalance — principled [economy.md](economy.md) model (1 AP = one basic-labour action) + crop re-tune (spread 2.64×→1.59×). ⚠️ baseline moved by design; arc healthy.
- **76** loading screen — overlay covers Start→first-full-frame, dismissed off real readiness (main-thread only).
- **77** building 3D + farmhouses — weather-station hipped roof (48×48) + 5 personality-keyed cottages baked per farm (render-only).
- **78** Pip-movement — reported breakage **not reproducible**; root cause was duplicate dev processes (a spectator socket swallowed input). Regression guard added in `run-registry.test.ts`.
- **79** click-to-target + action cursor — Pip acts on a clicked tile (Chebyshev ≤ 1), slot-generic CSS cursors, pan moved to middle/right-drag.

**55–65 — 2026-06-10:** client/server split (55–58, see below); peer-interaction fix (59, see *sim behaviour*); then a render-polish wave — 60 max-zoom 3→6, 61 continuous Pip movement + AABB, 62 per-island floors, 63 zoom-out water-shimmer fix, 64 water swell + foam breathing, 65 cliff skirts. Only 59 + 61 touch sim behaviour.

> Engine brief 09 (perf) closed 2026-06-10 after a post-split re-profile answered its deferred gates — measured analysis in [performance.md](performance.md). Pip + interaction work shipped without briefs — see [player-and-interaction.md](player-and-interaction.md).

## Engine briefs — all Done/Superseded

| Brief | Status |
|---|---|
| [01-tilemap](../briefs/engine/superseded/01-tilemap.md) | **Superseded** — WebGPU dropped; Canvas2D took over. |
| [02-input](../briefs/engine/done/02-input.md) · [03-tests](../briefs/engine/done/03-tests.md) · [04-spatial-anim](../briefs/engine/done/04-spatial-anim.md) | **Done (partial — animation/spatial halves undone)** — input + engine test suites shipped. Brief 04's `SpatialHashGrid` + `AnimationClip`/`Animator` were built (`0919cbc`) then **deleted as unused** in the `cleanup` commit `1d5f80c` (2026-06-04); `packages/engine/src/{spatial,animation}/` no longer exist. The animation primitive is being reintroduced **with consumers** by game brief 85 — see [wiki/animation.md](animation.md). |
| [05-pathfinder-into-movement](../briefs/engine/done/05-pathfinder-into-movement.md) | **Done** — WASM pathfinder confirmed load-bearing in `TravelSystem`. |
| [06-determinism-harness-and-analytics](../briefs/engine/done/06-determinism-harness-and-analytics.md) | **Done** — `CHECK_DETERMINISM=1` (MATCH/DIVERGE) + `EXPORT=csv\|json` in run-sim. |
| [07-chunked-tile-layer](../briefs/engine/done/07-chunked-tile-layer.md) | **Done** — `bakeStaticLayer` bakes the backdrop once; chunking unneeded. |
| [08-wasm-expansion](../briefs/engine/done/08-wasm-expansion.md) | **Done** — noise/rng/floodfill WASM; fixed the never-transferred-pathfinder bug. |
| [09-perf-optimization](../briefs/engine/done/09-perf-optimization.md) | **Done** — closed 2026-06-10; measured analysis in [performance.md](performance.md). |
| [10-wasm-pathfinder-allocator-fault](../briefs/engine/done/10-wasm-pathfinder-allocator-fault.md) · [11-wgsl-validation-guard](../briefs/engine/done/11-wgsl-validation-guard.md) · [12-gpu-day-night-wash](../briefs/engine/done/12-gpu-day-night-wash.md) · [13-living-water-shader](../briefs/engine/done/13-living-water-shader.md) · [14-weather-shader-parity](../briefs/engine/done/14-weather-shader-parity.md) · [15-cloud-shadows-and-mist](../briefs/engine/done/15-cloud-shadows-and-mist.md) · [16-foliage-wind-sway](../briefs/engine/done/16-foliage-wind-sway.md) | **Done** — 2026-06-12 improvement wave (one worktree branch per brief); details in "Where things stand" above + [log.md](../log.md). |

## Game briefs 01–48 — all Done

Foundational (01–23): personalities, weather/crops, market/shop, observer UI, regions + travel, spatial market, render, slate sales, peer trades, trust + endgame, focus camera, leaderboard, walk/meet/slate UI, playback controls, save/replay, seed picker, decision trace, event feed, complete auctions, seasons, mid-game shock. All **Done** — files in [../briefs/game/done/](../briefs/game/done/).

| Brief | One-line |
|---|---|
| [24-auction-bidding-golden-bean](../briefs/game/done/24-auction-bidding-golden-bean.md) | Agents bid; `golden_bean` valuable (resell/gift). Fixed the "no winner" dead auction. |
| [25-panel-overlap-fix](../briefs/game/done/25-panel-overlap-fix.md) | Observer + feed share one right-column flex container. |
| [26-day-night-seasonal-grading](../briefs/game/done/26-day-night-seasonal-grading.md) | Render-side day/night + seasonal wash (tick-synced, sim untouched). |
| [27-long-days-intraday-timeline](../briefs/game/done/27-long-days-intraday-timeline.md) | `ticksPerDay` 20→1200; intra-day phases + SLEEP; economy stays day-denominated. |
| [28-ap-economy-rework](../briefs/game/done/28-ap-economy-rework.md) | AP `100+2·day`, sleep-gated, free travel, friend discounts. |
| [29-irrigation-crop-death](../briefs/game/done/29-irrigation-crop-death.md) | Watering required (2-day grace); rain auto-waters; survival-reflex keeps deaths ~0. |
| [30-procedural-ground-texture](../briefs/game/done/30-procedural-ground-texture.md) | Per-tile value-noise baked into the static layer. |
| [32-rendering-overhaul](../briefs/game/done/32-rendering-overhaul.md) | Y-sort, shadows, particles, walk/work/idle-bob, bigger atlas. Orthographic. |
| [33-world-expansion](../briefs/game/done/33-world-expansion.md) | 11 regions, tool system, watering can, resource drops, decorations, plot decay. |
| [35-player-activity](../briefs/game/done/35-player-activity.md) | Slower movement, action time cost, home/sleep routine, market visits, debug player. |
| [36-end-of-run-recap](../briefs/game/done/36-end-of-run-recap.md) | Day-100 "Legends" recap; passive `RunHistorySystem` + pure `summarizeRun`. |
| [37-rivalries-and-relationship-legibility](../briefs/game/done/37-rivalries-and-relationship-legibility.md) | Relationship matrix + `RivalrySystem`. *(Was DORMANT; brief 59 made peer events fire.)* |
| [38-drama-scoring-and-narrative-escalation](../briefs/game/done/38-drama-scoring-and-narrative-escalation.md) | Per-event `drama` (act-band weighted) → feed ★ emphasis, rank-flip lines, recap headline. |
| [39-wealth-over-time-graph](../briefs/game/done/39-wealth-over-time-graph.md) | Multi-line wealth chart + crossings; live `wealthSeries` on the snapshot (render-only). |
| [40-thought-bubbles-and-highlight-skip](../briefs/game/done/40-thought-bubbles-and-highlight-skip.md) | Intention bubbles + `skipToHighlight` (H) + feed-click-to-zoom. *Completes 36–40.* |
| [41-crop-roster-and-quality-tiers](../briefs/game/done/41-crop-roster-and-quality-tiers.md) | 8 season-gated crops + Normal/Silver/Gold quality (forked rng); quality-weighted net worth. **The spine.** |
| [42-livestock-and-orchards](../briefs/game/done/42-livestock-and-orchards.md) | Coops/barns (care→product) + perennial orchards. Fires live. |
| [43-greenhouse-and-farm-skill-progression](../briefs/game/done/43-greenhouse-and-farm-skill-progression.md) | Season-immune greenhouse + 4 per-farm skills. Fires live (skills lopsided to farming). |
| [44-living-world-working-npcs-and-tavern](../briefs/game/done/44-living-world-working-npcs-and-tavern.md) | Carpenter/blacksmith fulfill real commissions; tavern (gossip + hire-help + gathering); notice-board demand. |
| [45-seasonal-visual-identity-and-festivals](../briefs/game/done/45-seasonal-visual-identity-and-festivals.md) | Season-variant tiles + rain/snow (render) + 4 fixed festivals (days 13/38/63/88) with deterministic harvest contest. |
| [46-harbor-shipping-and-contracts](../briefs/game/done/46-harbor-shipping-and-contracts.md) | Harbor island + dockmaster/dock/cargo-ship + seeded time-boxed contract economy (commit→deliver / miss→penalty). Hoarder fulfills live. |
| [48-boats-and-coral-fishing](../briefs/game/done/48-boats-and-coral-fishing.md) | Per-farm boats + a separate boat-travel grid; two coral reefs with boat-only fish (`coral-trout`/`lobster`). `deliberateCoralFishing` in all 4 personalities. |

*(Briefs 49–79 are one-lined in the "Recent briefs" section above.)*

## Current sim behaviour & determinism

- **Tests/typecheck:** green; latest counts in the newest [log.md](../log.md) entry (not tracked here). farm-valley runs node-by-default with jsdom scoped to the ~9 DOM test files (vitest `projects`); `CHECK_DETERMINISM` runs its passes in parallel `worker_threads`.
- **Determinism is load-bearing**, verified `MATCH ×3` (seeds `0xc0ffee/1/42`). The contract is *same seed reproduces itself byte-for-byte* — **not** equality to pre-change numbers. The 2026-06-09 radial reorg, briefs 41–46/48 (new systems), and 70/73/74/75 (balance/region/economy) each **re-baselined outcomes by design**; reproducibility was re-verified each time. Brief 48 verified MATCH ×3 at both `ticksPerDay=20` and `1200` (raw `Math.random` in ACT paths is a nondeterminism bomb — fishing/mining use forked rng channels; grep confirms zero `Math.random` in sim-core source).
- **Headless-probe pitfall:** a headless `bootstrapSim` check **must** pass `pathfinder: new JsPathfinder()`, or `TravelSystem` is omitted and every travel-gated action silently no-ops (false "dormant"). See [open-questions.md](open-questions.md) for the JS-vs-WASM route caveat.
- **Leader-runaway / peer-interaction:** the old "one farmer runs away, field flat, peer layer inert" premise is **stale** (21-farmer radial field self-distributes; brief 59 fixed the peer-trade price bug + added `OFFER_CROP`). Full detail + the residual drama gaps in [open-questions.md](open-questions.md).

## Architecture milestones (no brief / cross-brief)

- **Client/server split (briefs 55–58):** the sim moved out of the browser into a Node server; the Vite app is a pure WebSocket client. Sim logic in `@farm/sim-core`; `@farm/server` hosts it; `npm run dev` runs both (Vite proxies `/sim`). Determinism held (WASM baseline). Deploy gained a pm2 + Caddy-WS phase (**dry-run-verified only — real VPS run pending**). Found along the way: JS≠WASM pathfinder routes (server uses WASM), and a fixed module-global `lastFacing` bug (now per-run `SnapshotSpriteState`). See [architecture.md](architecture.md), [decisions.md](decisions.md).
- **Post-corpus (no brief):** Canvas2D renderer (replaced WebGPU), in-house ECS (replaced miniplex), WASM pathfinding infra, the sim↔render snapshot/interpolate boundary, home screen, headless run-sim, offline world-preview, README, **Pip** + interaction systems, and the **160×160 radial archipelago** (2026-06-09). A 2026-06-06 refactor split every >300-line file into module directories fronted by barrels — see [architecture.md](architecture.md) → *Module-directory convention*.

## Open gaps
See [open-questions.md](open-questions.md) for the live list.
