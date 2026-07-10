# Corpus Index

The catalog. **Read this page, then at most 2–3 wiki pages** — the `summary:` line of each page below
is the triage signal, so you should rarely need to open a page to find out whether it's relevant.
If answering a question needs more than three pages, a page needs splitting (see [CLAUDE.md](CLAUDE.md)).

Every wiki page carries `summary:` + `updated:` frontmatter. The lines below are generated from it —
regenerate with `bash corpus/lint.sh --index` rather than hand-editing.

## Schema & log

- [CLAUDE.md](CLAUDE.md) — how this directory works; conventions; workflows; the retrieval budget
- [routing.md](routing.md) — which question goes to which layer (wiki / code graph / grep / tests)
- [log.md](log.md) — chronological record of corpus changes

## Wiki — start here for synthesis

### Cross-cutting (both games)

- [wiki/architecture.md](wiki/architecture.md) — The load-bearing map: workspaces, the four-layer dependency rule, the sim loop, ECS, message bus, per-tick data flow, render, and WASM.
- [wiki/code-graph.md](wiki/code-graph.md) — The CodeGraph symbol index as the code-understanding layer: the two-layer why/what model, and its **measured failure modes** (it conflates same-named symbols across the two games).
- [wiki/decisions.md](wiki/decisions.md) — Locked tech choices that future briefs must not relitigate — stack, sim, ECS, renderer, assets, palette, concurrency, WASM, and the gameplay source-of-truth.
- [wiki/status.md](wiki/status.md) — The current-state snapshot: one terse line per brief, architecture milestones, current sim/determinism behaviour, and open gaps. The single source for brief state.
- [wiki/open-questions.md](wiki/open-questions.md) — Live list of what is genuinely unresolved, plus settled premises that must not be re-litigated. Resolved items are deleted, not archived.
- [wiki/performance.md](wiki/performance.md) — Ranked optimization backlog for the engine, filtered against what the code actually does — tiers 0–3, what is already done, and what is explicitly not worth doing at Farm Valley's scale.
- [wiki/performance-measurements.md](wiki/performance-measurements.md) — The profiling record: how to measure (`Profiler` + `?profile` + DebugOverlay), plus the 2026-06-05 and 2026-06-10 measured baselines every optimization claim is scored against.
- [wiki/asset-pipeline.md](wiki/asset-pipeline.md) — The bake principle (assets are code, not images), asset-cooking and atlas research, and the cache-key/incremental-build recommendations that became brief 71.
- [wiki/shader-ideas.md](wiki/shader-ideas.md) — Book-of-Shaders techniques filtered against the WebGPU renderer. Ideas, not committed work.

### Farm Valley

- [wiki/overview.md](wiki/overview.md) — What Farm Valley is (a watch-it-play sim of 21 farmers over 100 days), its SPADE-prototype lineage, and the four personality archetypes.
- [wiki/system-ordering.md](wiki/system-ordering.md) — Why every system in bootstrapSim sits where it does — the ten bands, the inbox lifecycle, cross-cutting invariants, and the system-to-brief provenance map.
- [wiki/economy.md](wiki/economy.md) — The single prices ↔ AP ↔ initial-gold model the economy constants derive from, the crop g/AP formula, the scoring table, and the re-tune procedure.
- [wiki/player-and-interaction.md](wiki/player-and-interaction.md) — The playable farmer Pip, the in-canvas `@engine/ui` GUI, hotbar, inventory, fishing, forageables, hover tooltips, and feature collision.
- [wiki/farm-world-dressing.md](wiki/farm-world-dressing.md) — World dressing and scenery: workshop buildings, island edge bands, coral zones, bridges, plot layout, and the 240×240 radial archipelago layout (**source of truth for tile geometry**).
- [wiki/world-generation.md](wiki/world-generation.md) — The rect-based radial archipelago model, its deterministic generation pipeline, and the ranked menu of more-organic techniques.
- [wiki/animation.md](wiki/animation.md) — How farmers, Pip, NPCs and scenery animate — the scattered ad-hoc state, the deleted brief-04 `Animator` ghost, and the render-side animation-engine direction.

### Citadel

- [wiki/citadel-overview.md](wiki/citadel-overview.md) — What Citadel is (settlement sim on the shared engine), the 2026-06-28 **cozy pivot** design-of-record, its packages, sim systems, and shared invariants.
- [wiki/citadel-decisions.md](wiki/citadel-decisions.md) — Citadel's game-design decisions of record (#11-#20, 2026-07-10) — what MP is, who it's for, what that removes, and why a "mode" is a call-site preset rather than sim state. Four reverse earlier commitments.
- [wiki/citadel-hud-and-overlays.md](wiki/citadel-hud-and-overlays.md) — HUD, overlays, and diegetic feedback surfaces: top bar, goods strip, build bar, inspect panel, minimap, notifications.
- [wiki/citadel-rendering.md](wiki/citadel-rendering.md) — The WebGPU-only render path: sprite-batch quads, baked terrain, iso projection, road/bridge networks, atlas wiring.
- [wiki/citadel-art-style.md](wiki/citadel-art-style.md) — The cozy-medieval-storybook iso pixel-art style bible — EDG32 palette roles, shading/form/light rules, the layered-composite authoring path.
- [wiki/citadel-asset-critique.md](wiki/citadel-asset-critique.md) — The whole-set visual acceptance bar: a seven-section critique checklist plus the PASS/CONDITIONAL/FAIL verdict rule.
- [wiki/citadel-asset-verdicts.md](wiki/citadel-asset-verdicts.md) — Historical grading record for the art-04..07 wave (baseline, re-grade, final verdicts).
- [wiki/citadel-road-builder-ux.md](wiki/citadel-road-builder-ux.md) — Road/wall drawing UX: what OpenTTD, Skylines, Factorio and Anno do, mapped onto Citadel's drag-build, with the connectivity-feedback gap.

## Briefs — historical task specs (immutable archives)

Each brief is the spec that directed a slice of work; once in `done/`/`superseded/` it is immutable.
**[status.md](wiki/status.md) is the single source for brief state** — this page deliberately does not
duplicate the catalog. Number prefixes are stable across directory moves.

- Engine: [briefs/engine/](briefs/engine/) — `done/` 02–17, `superseded/` 01 + the WebGPU wave, `todo/` 18–19
- Game: [briefs/game/](briefs/game/) — briefs 01–112; 01–95 plus 97 and 108 are Done or Superseded, `todo/` holds 96, 98–107, 109–112
- Citadel: [briefs/citadel-apr.md](briefs/citadel-apr.md) plus the `todos/*citadel-*` files

For era-level context read [log.md](log.md).
