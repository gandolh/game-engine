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
- [wiki/citadel-art-style.md](wiki/citadel-art-style.md) — Citadel's **cozy medieval storybook** iso pixel-art style bible: EDG32 palette roles, shading/form/light rules, the **layered-composite authoring path** (`composite([...Layer])` + reusable detail modules, art-12), per-recipe checklist; drives the 2026-07-01/02 art-quality briefs (2×, buildings/units/roads/terrain fidelity, fBm atmosphere)
- [wiki/citadel-asset-critique.md](wiki/citadel-asset-critique.md) — the **asset critique checklist & verdict rubric**: the whole-set visual acceptance bar (silhouette/depth/isometry/seams/atmosphere/fire/cohesion) graded PASS/CONDITIONAL/FAIL against the art-06 showcase screenshots at the end of the art-04..07 wave
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
- **todo/**: [18-ui-authored-typography-and-icons](briefs/engine/todo/18-ui-authored-typography-and-icons.md) (authored pixel font + icon glyphs for `@engine/ui`; restores the Citadel build-bar icon grid) · [19-audio-subsystem](briefs/engine/todo/19-audio-subsystem.md) (**dispatch-ready**: new `@engine/core/audio` — Web Audio, off-sim, headless-testable — + 2-3 procedural test sounds wired into both games; 1 senior + 2 junior chunks)

### Game

Game briefs run **01–109**; 01–95 are Done or Superseded. The **game** `todo/` queue (populated 2026-07-02/03 from the full-repo review + backlog promotion):
- [96-citadel-building-art-style-reference](briefs/game/todo/96-citadel-building-art-style-reference.md) — standing art-direction reference (not a one-shot task)
- [97-review-fix-wave](briefs/game/todo/97-review-fix-wave.md) — **ready to execute**: the approved P0/P1 fix wave (server DoS clamps, ghost workers, MP pause authority, juice plateau, agent fixes, corpus sweep)
- [98-farm-market-wall-wire-or-remove](briefs/game/todo/98-farm-market-wall-wire-or-remove.md) — decision brief: complete or strip the dead trade loop
- [99-p2-debt-cleanup-batch](briefs/game/todo/99-p2-debt-cleanup-batch.md) — mechanical debt wave (review findings 28–34)
- [100-citadel-economy-growth-pass](briefs/game/todo/100-citadel-economy-growth-pass.md) — the two-way economy's upside (service-responsive production + growth trickle); largest tracked gameplay gap
- [101-farm-perishability-distance-pricing](briefs/game/todo/101-farm-perishability-distance-pricing.md) — freshness + distance economy (large, needs a focused reviewed session)
- [102-citadel-disease-counterplay](briefs/game/todo/102-citadel-disease-counterplay.md) — the last untouched playtest finding (P3)
- [103-citadel-challenge-mode](briefs/game/todo/103-citadel-challenge-mode.md) — expose the frozen sharp systems as an opt-in mode (depends on 97)
- [104-citadel-movement-feel-polish](briefs/game/todo/104-citadel-movement-feel-polish.md) — gait/facing/corner-cutting (render-only)
- [105-citadel-crowd-honesty-mp-owner-filter](briefs/game/todo/105-citadel-crowd-honesty-mp-owner-filter.md) — ambient crowd vs population + MP villager owner-filter
- [106-citadel-dom-to-canvas-residuals](briefs/game/todo/106-citadel-dom-to-canvas-residuals.md) — migrate the last DOM readouts (siege/hazard)
- [107-farm-visual-verification-session](briefs/game/todo/107-farm-visual-verification-session.md) — clear the accumulated in-browser eyeball debt (run after 97)
- [108-citadel-live-mp-verification](briefs/game/todo/108-citadel-live-mp-verification.md) — two-tab MP pass over the never-verified-live items (run after 97)
- [109-citadel-vps-deploy](briefs/game/todo/109-citadel-vps-deploy.md) — deploy Citadel alongside the Farm VPS setup Per-brief one-liners live in [status.md](wiki/status.md) (the single source for brief state); done files in [briefs/game/done/](briefs/game/done/), superseded in [briefs/game/superseded/](briefs/game/superseded/) (incl. [94-upscale-units-terrain](briefs/game/superseded/94-upscale-units-terrain-to-match-buildings.md), obsoleted by the 4×→1× revert). For era-level context see [log.md](log.md). Don't duplicate the brief catalog here — status.md owns it.
