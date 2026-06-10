# Corpus Index

Catalog of everything in this corpus. Start here.

## Schema & log

- [CLAUDE.md](CLAUDE.md) — how this directory works; conventions; workflows
- [log.md](log.md) — chronological record of corpus changes

## Wiki — start here for synthesis

- [wiki/overview.md](wiki/overview.md) — what Farm Valley is; lineage; cast
- [wiki/architecture.md](wiki/architecture.md) — workspaces, layers, sim loop, ECS, message bus, module-directory convention, data flow
- [wiki/player-and-interaction.md](wiki/player-and-interaction.md) — the playable farmer Pip, hotbar, hover tooltips, feature collision, bridges, plot layout, the 88×80 archipelago layout
- [wiki/world-generation.md](wiki/world-generation.md) — the rect-based archipelago model, the procedural southern farm band (21-farmer scale), and the ranked menu for more organic generation
- [wiki/decisions.md](wiki/decisions.md) — locked tech choices
- [wiki/performance.md](wiki/performance.md) — optimization opportunities filtered against actual code; what's already done; what's not worth doing at current scale
- [wiki/asset-pipeline.md](wiki/asset-pipeline.md) — the bake principle, asset-cooking/caching research (cache keys, deterministic PNG, incremental per-sheet builds), atlas best practice for a Canvas2D pixel-art game; feeds brief 71
- [wiki/status.md](wiki/status.md) — what's done, what's open (brief-by-brief, current state)
- [wiki/open-questions.md](wiki/open-questions.md) — live list of gaps and unresolved questions

## Briefs — historical task specs (immutable archives)

Each brief is the spec that directed a slice of work. Once in `done/`/`superseded/` they are immutable — `status.md` carries the current one-line state of each, so this catalog is link-only. Number prefixes are stable across dir moves.

### Engine

- **done/**: [02-input](briefs/engine/done/02-input.md) · [03-tests](briefs/engine/done/03-tests.md) · [04-spatial-anim](briefs/engine/done/04-spatial-anim.md) · [05-pathfinder-into-movement](briefs/engine/done/05-pathfinder-into-movement.md) · [06-determinism-harness-and-analytics](briefs/engine/done/06-determinism-harness-and-analytics.md) · [07-chunked-tile-layer](briefs/engine/done/07-chunked-tile-layer.md) · [08-wasm-expansion](briefs/engine/done/08-wasm-expansion.md)
- **superseded/**: [01-tilemap](briefs/engine/superseded/01-tilemap.md) (WebGPU renderer dropped)
- **todo/**: [09-perf-optimization](briefs/engine/todo/09-perf-optimization.md) — prioritized perf pass; source analysis in [wiki/performance.md](wiki/performance.md)

### Game

- **done/** — briefs 01–49, all shipped (see [briefs/game/done/](briefs/game/done/) for the files and [status.md](wiki/status.md) for per-brief one-liners). Spans personalities, weather/crops, market/shop/auctions, observer UI, regions + travel, peer trades, trust, the camera/leaderboard/playback/seed/decision-trace/event-feed spectator UI, seasons, mid-game shock, day/night grading, long days, AP rework, irrigation, the rendering overhaul + world expansion, player activity, the 36–40 spectator/story layer, the 41–46 depth wave (crop roster + quality, livestock + orchards, greenhouse + skills, working NPCs + tavern, festivals, harbor + contracts), the 47 atlas split, the 48 boats + coral fishing, the 49 organic-procgen pass (fBm + domain-warp texture, jittered farm band, clustered tile features, open-water props; track 3/Simplex deferred), the 50 interactive shrine island (visit→bounded AP buff, opportunist-only), the 51 three heritage landmark islands (decorative standing-stones / ruined-tower / statue), the 52 animated waterfall island, and the 54 camping island (rest away from home without the unrested penalty) — the **complete "more islands" theme** (50/51/52/54 built; 53-bar superseded into a tavern same-day-AP tweak). Briefs 08/09/10 each have a `*-plan.md` companion alongside the brief.
- **todo/**: [70-raise-starting-gold-peer-trade-liquidity](briefs/game/todo/70-raise-starting-gold-peer-trade-liquidity.md)
- **done/ (latest)**: [71-per-asset-recipe-files-and-cached-atlas-builds](briefs/game/done/71-per-asset-recipe-files-and-cached-atlas-builds.md) — recipe monolith split into one file per asset + hash-cached per-sheet atlas builds; research in [wiki/asset-pipeline.md](wiki/asset-pipeline.md)
- **superseded/**: [53-remote-bar-gold-for-ap](briefs/game/superseded/53-remote-bar-gold-for-ap.md) — duplicate of the brief-44 tavern's gold→AP; improved the tavern (same-day boost) instead.
