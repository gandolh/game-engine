---
title: "Build order + dependency graph for Citadel (medieval city/fortress builder)"
created: 2026-06-18
status: reference
tags: [planning, citadel]
---

# Build order — Citadel

New game on the existing engine. Full design of record: [briefs/citadel-apr.md](../briefs/citadel-apr.md).
Grilled to zero open questions on 2026-06-18 (all decisions in the APR + each todo's
"Decisions (grilled 2026-06-18)" section).

**Premise:** player-planner medieval city/fortress builder. You grow a citadel on a
~96×96 plot in real time: lay roads, place multi-tile buildings, run a food+materials
economy, keep people happy, survive sieges. Open-ended sandbox. Single-player v1,
MP-ready substrate. Determinism load-bearing — command log = save/replay/MP-sync.

## Strictly sequential phases (each gates the next)

Revised 2026-06-18 (third grilling — feature additions folded in: terrain, bread chain,
seasons, decrees, trader, fire/disease, settlement tiers).

- **[Phase 0 — Skeleton + terrain](2026-06-18-citadel-01-phase0-skeleton.md)** — new `citadel` +
  `citadel-sim-core` packages on `@engine/*` only; **seeded varied terrain** (water/forest/
  stone/rough via engine Perlin); 96×96 plot renders; camera pan/zoom; pause+speed;
  deterministic 20Hz worker loop; placeholder-rectangle render. *Gates everything.*
- **[Phase 1 — Command queue + placement](2026-06-18-citadel-02-phase1-commands-placement.md)**
  — engine command-queue substrate (main→worker, drained per tick, deterministic);
  footprint placement + **terrain-aware** validity + walkable-grid rebuild; ghost-preview
  click-to-place. *First playable interaction. Gates Phase 2.*
- **[Phase 2 — Economy MVP (v1 PLAYABLE)](2026-06-18-citadel-03-phase2-economy-mvp.md)**
  — terrain resource nodes; **Farm→Mill→Bakery bread chain**; Woodcutter-near-forest; road
  laying + connectivity validation; job-driven walkers (auto-assign); physical hauling;
  pull-model immigration; starvation spiral; **winter-bite seasons**. 7 buildings:
  House/Farm/Mill/Bakery/Woodcutter/Storehouse/Road. **← the MVP bar.** *Gates Phase 3.*
- **[Phase 3 — Happiness + governance](2026-06-18-citadel-04-phase3-happiness.md)** — needs
  (faith/safety/goods), happiness, unrest/leaving; services (chapel, market); **decrees/
  policies** (rationing/conscription/tithe/work-hours); **barter trader / Trading Post**.
  *Builds on Phase 2 economy.*
- **[Phase 4 — Threat/siege layer](2026-06-18-citadel-05-phase4-siege.md)** — Quarry→stone,
  Sawmill→planks, Smith→tools; walls (1-wide) / gates / towers / garrison / keep; raider
  spawn + pathing; deterministic siege resolution; fail-by-sack. *Builds on Phase 2 roads/pathfinding.*
- **[Phase 4.5 — Hazards (fire + disease)](2026-06-18-citadel-055-phase45-hazards.md)** —
  fire spreads through dense wooden packing (wells/spacing mitigate); disease spreads in
  crowded/unhappy pop (healer/sanitation mitigate). *Spatial threats; builds on Phase 3 happiness + grid proximity.*
- **[Phase 5 — Tiers + art + polish](2026-06-18-citadel-06-phase5-art-polish.md)** —
  **settlement tiers** (Hamlet→Village→Town→Citadel→Fortress-City) as the progression spine;
  authored EDG32 sprites swapped for placeholders; save/load via command log.
  *Last; non-blocking for "is it a game".*

## Substrate to promote into `@engine/*` (not game-specific)

Identified during Phases 1–2; promote up so the game stays thin and Farm Valley could
later adopt them:
- **Command-queue protocol** (Phase 1) — deterministic main→worker commands; log = save/replay/MP.
- **Footprint placement system** (Phase 1) — multi-tile occupancy, validity, walkable rebuild.
- **Road-connectivity validation** (Phase 2) — reachability recompute + disconnected-flagging.

## Invariants (do not violate — see CLAUDE.md + decisions.md)

- EDG32 palette enforced (placeholder rects use `EDG.*` too).
- No `.js` import suffixes; pinned versions; TS strict.
- Engine never imports game; `citadel` never imports `farm-valley`/`@farm/sim-core`.
- No `Math.random`/`Date.now` in sim — all randomness via seeded `Rng`.
- bootstrapSim stays Worker-agnostic (headless run-sim + tests drive it directly).
