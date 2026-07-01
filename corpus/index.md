# Corpus Index

Catalog of everything in this corpus. Start here.

## Schema & log

- [CLAUDE.md](CLAUDE.md) — how this directory works; conventions; workflows
- [log.md](log.md) — chronological record of corpus changes

## Wiki — start here for synthesis

- [wiki/overview.md](wiki/overview.md) — what Farm Valley is; lineage; cast
- [wiki/citadel-overview.md](wiki/citadel-overview.md) — **Citadel**, the second game on the shared engine (settlement/RTS sim): packages, systems, worker topology, briefs/todos
- [wiki/citadel-road-builder-ux.md](wiki/citadel-road-builder-ux.md) — road/wall drawing UX: cross-game research (OpenTTD/Skylines/Factorio/Anno) + ranked recommendation; current drag-build state, gaps (esp. no connectivity feedback), and the scoped feedback todo
- [wiki/architecture.md](wiki/architecture.md) — workspaces, layers, sim loop, ECS, message bus, module-directory convention, data flow
- [wiki/player-and-interaction.md](wiki/player-and-interaction.md) — the playable farmer Pip, hotbar, hover tooltips, feature collision, bridges, plot layout, the 160×160 radial archipelago layout (source of truth for tile geometry); **all UI now renders in-canvas via `@engine/ui`** (2026-07-01) with world-anchored inspect card + drag-from-world hotbar + diegetic HUD
- [wiki/world-generation.md](wiki/world-generation.md) — the rect-based radial archipelago model (central cluster + two concentric farm rings, 21-farmer scale), and the ranked menu for more organic generation
- [wiki/decisions.md](wiki/decisions.md) — locked tech choices
- [wiki/performance.md](wiki/performance.md) — optimization opportunities filtered against actual code; what's already done; what's not worth doing at current scale
- [wiki/economy.md](wiki/economy.md) — the prices ↔ AP ↔ initial-gold model (1 AP = one basic-labour action; crop g/AP formula + scoring table); the basis for any balance re-tune (brief 75)
- [wiki/asset-pipeline.md](wiki/asset-pipeline.md) — the bake principle, asset-cooking/caching research (cache keys, deterministic PNG, incremental per-sheet builds), atlas best practice for a Canvas2D pixel-art game; feeds brief 71
- [wiki/citadel-art-style.md](wiki/citadel-art-style.md) — Citadel's **cozy medieval storybook** iso pixel-art style bible: EDG32 palette roles, shading/form/light rules, per-recipe checklist; drives the 2026-07-01 art-quality briefs (2×, buildings/units/roads/terrain fidelity, fBm atmosphere)
- [wiki/system-ordering.md](wiki/system-ordering.md) — why each system in `bootstrapSim` is registered in its position; inbox lifecycle; cross-cutting ordering invariants
- [wiki/shader-ideas.md](wiki/shader-ideas.md) — Book of Shaders techniques filtered against the WebGPU renderer: TODO backlog (water noise/Voronoi caustics, GPU day/night wash, cloud shadows, weather parity) + the EDG32-compliance strategies for procedural shaders
- [wiki/status.md](wiki/status.md) — what's done, what's open (brief-by-brief, current state)
- [wiki/animation.md](wiki/animation.md) — how farmers/Pip/NPCs/scenery animate; the scattered ad-hoc state, the brief-04 `Animator` ghost (built then deleted), and the render-side animation-engine direction (feeds brief 85)
- [wiki/open-questions.md](wiki/open-questions.md) — live list of gaps and unresolved questions

## Briefs — historical task specs (immutable archives)

Each brief is the spec that directed a slice of work. Once in `done/`/`superseded/` they are immutable — `status.md` carries the current one-line state of each, so this catalog is link-only. Number prefixes are stable across dir moves.

### Engine

- **done/**: [02-input](briefs/engine/done/02-input.md) · [03-tests](briefs/engine/done/03-tests.md) · [04-spatial-anim](briefs/engine/done/04-spatial-anim.md) · [05-pathfinder-into-movement](briefs/engine/done/05-pathfinder-into-movement.md) · [06-determinism-harness-and-analytics](briefs/engine/done/06-determinism-harness-and-analytics.md) · [07-chunked-tile-layer](briefs/engine/done/07-chunked-tile-layer.md) · [08-wasm-expansion](briefs/engine/done/08-wasm-expansion.md) · [09-perf-optimization](briefs/engine/done/09-perf-optimization.md) (closed 2026-06-10; measured analysis in [wiki/performance.md](wiki/performance.md)) · **shipped 2026-06-12 improvement wave:** [10-wasm-pathfinder-allocator-fault](briefs/engine/done/10-wasm-pathfinder-allocator-fault.md) · [11-wgsl-validation-guard](briefs/engine/done/11-wgsl-validation-guard.md) · [12–16 shader-wave](briefs/engine/done/12-16-shader-wave.md) (day/night wash · living water · weather parity · cloud shadows · foliage sway — merged rollup) · **2026-06-30:** [17-engine-ui-framework](briefs/engine/done/17-engine-ui-framework.md) (`@engine/ui` — cross-game in-canvas UI toolkit (widgets/layout/text/input/a11y), dual-backend)
- **superseded/**: [01-tilemap](briefs/engine/superseded/01-tilemap.md) (WebGPU renderer dropped) · `superseded/webgpu/` — the whole WebGPU migration wave-plan, closed won't-do (planning complete, execution never started)
- **todo/**: *(empty)*

### Game

Game briefs **01–89 are all Done or Superseded** (both `todo/` dirs empty as of 2026-06-13). Per-brief one-liners live in [status.md](wiki/status.md) (the single source for brief state); done files in [briefs/game/done/](briefs/game/done/), superseded in [briefs/game/superseded/](briefs/game/superseded/). For era-level context see [log.md](log.md). Don't duplicate the brief catalog here — status.md owns it.
