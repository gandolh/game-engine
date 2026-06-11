# Corpus Index

Catalog of everything in this corpus. Start here.

## Schema & log

- [CLAUDE.md](CLAUDE.md) — how this directory works; conventions; workflows
- [log.md](log.md) — chronological record of corpus changes

## Wiki — start here for synthesis

- [wiki/overview.md](wiki/overview.md) — what Farm Valley is; lineage; cast
- [wiki/architecture.md](wiki/architecture.md) — workspaces, layers, sim loop, ECS, message bus, module-directory convention, data flow
- [wiki/player-and-interaction.md](wiki/player-and-interaction.md) — the playable farmer Pip, hotbar, hover tooltips, feature collision, bridges, plot layout, the 160×160 radial archipelago layout (source of truth for tile geometry)
- [wiki/world-generation.md](wiki/world-generation.md) — the rect-based radial archipelago model (central cluster + two concentric farm rings, 21-farmer scale), and the ranked menu for more organic generation
- [wiki/decisions.md](wiki/decisions.md) — locked tech choices
- [wiki/performance.md](wiki/performance.md) — optimization opportunities filtered against actual code; what's already done; what's not worth doing at current scale
- [wiki/economy.md](wiki/economy.md) — the prices ↔ AP ↔ initial-gold model (1 AP = one basic-labour action; crop g/AP formula + scoring table); the basis for any balance re-tune (brief 75)
- [wiki/asset-pipeline.md](wiki/asset-pipeline.md) — the bake principle, asset-cooking/caching research (cache keys, deterministic PNG, incremental per-sheet builds), atlas best practice for a Canvas2D pixel-art game; feeds brief 71
- [wiki/system-ordering.md](wiki/system-ordering.md) — why each system in `bootstrapSim` is registered in its position; inbox lifecycle; cross-cutting ordering invariants
- [wiki/shader-ideas.md](wiki/shader-ideas.md) — Book of Shaders techniques filtered against the WebGPU renderer: TODO backlog (water noise/Voronoi caustics, GPU day/night wash, cloud shadows, weather parity) + the EDG32-compliance strategies for procedural shaders
- [wiki/status.md](wiki/status.md) — what's done, what's open (brief-by-brief, current state)
- [wiki/open-questions.md](wiki/open-questions.md) — live list of gaps and unresolved questions

## Briefs — historical task specs (immutable archives)

Each brief is the spec that directed a slice of work. Once in `done/`/`superseded/` they are immutable — `status.md` carries the current one-line state of each, so this catalog is link-only. Number prefixes are stable across dir moves.

### Engine

- **done/**: [02-input](briefs/engine/done/02-input.md) · [03-tests](briefs/engine/done/03-tests.md) · [04-spatial-anim](briefs/engine/done/04-spatial-anim.md) · [05-pathfinder-into-movement](briefs/engine/done/05-pathfinder-into-movement.md) · [06-determinism-harness-and-analytics](briefs/engine/done/06-determinism-harness-and-analytics.md) · [07-chunked-tile-layer](briefs/engine/done/07-chunked-tile-layer.md) · [08-wasm-expansion](briefs/engine/done/08-wasm-expansion.md) · [09-perf-optimization](briefs/engine/done/09-perf-optimization.md) (closed 2026-06-10; measured analysis in [wiki/performance.md](wiki/performance.md))
- **superseded/**: [01-tilemap](briefs/engine/superseded/01-tilemap.md) (WebGPU renderer dropped)
- **todo/**: *(empty)*

### Game

Game briefs **01–79 are shipped**; **`todo/`**: [80-fishing-cast-tiles-stale](briefs/game/todo/80-fishing-cast-tiles-stale.md) (AI fishing dead — stale off-isle cast tiles + a self-validating guard; baseline-mover, awaiting sign-off) · [82-agent-movement-interpolation](briefs/game/todo/82-agent-movement-interpolation.md) (non-farmer movers snap tile-to-tile — widen the snapshot `interpolate` flag + teleport-distance clamp; render-only). Per-brief one-liners in [status.md](wiki/status.md); done files in [briefs/game/done/](briefs/game/done/). Coverage by range:
- **01–35** — personalities, weather/crops, market/shop/auctions, observer + spectator UI (camera/leaderboard/playback/seed/decision-trace/event-feed), regions + travel, peer trades + trust, seasons, mid-game shock, day/night + seasonal grading, long days + AP rework + irrigation, rendering overhaul + world expansion, player activity.
- **36–48** — spectator/story layer (36–40); gameplay-depth wave (41–46: crop roster + quality, livestock + orchards, greenhouse + skills, working NPCs + tavern, festivals, harbor + contracts); 47 atlas split; 48 boats + coral fishing.
- **49–54** — organic procgen (49: fBm + domain-warp, clustered features, open-water props; Simplex deferred) + the "more islands" theme (50 shrine, 51 heritage islets, 52 waterfall, 54 camping; 53 superseded into a tavern tweak).
- **55–65** — client/server split (55–58), peer-interaction fix (59), zoom/water/cliffs render polish (60–65).
- **66–81** — tab-resync (66), camera smoothing (67), ambient life (68), named system stages (69), startgold bump (70), per-asset atlas recipes (71), shared-run lobby server (72), travel-reachability guards (73), weather-station island (74), economy rebalance (75), loading screen (76), building 3D + farmhouses (77), Pip-movement not-reproducible (78), click-to-target + action cursor (79), pseudo-3D height (z) axis + persistent rain field with ground/water splashes (81).
- **superseded/**: [53-remote-bar-gold-for-ap](briefs/game/superseded/53-remote-bar-gold-for-ap.md) (folded into the brief-44 tavern). Briefs 08/09/10 each carry a `*-plan.md` companion.
