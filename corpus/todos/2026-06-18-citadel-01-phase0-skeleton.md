---
title: "Citadel Phase 0 — package skeleton + rendering empty plot"
created: 2026-06-18
status: open
tags: [citadel, phase0, foundation]
---

# Phase 0 — Skeleton

Stand up the new game next to farm-valley with nothing in it but a rendered empty plot
and a running deterministic loop. No gameplay. Gates every later phase.

## Scope

- New workspace packages:
  - `packages/citadel-sim-core` (`@citadel/sim-core`) — sim systems, world, components. Depends only on `@engine/core`.
  - `packages/citadel` — Vite SPA client. Depends on `@engine/core` + `@citadel/sim-core`. Never imports `farm-valley`/`@farm/sim-core`.
  - Register both in root `package.json` workspaces.
- World: a single bounded **96×96** tile plot (16px tiles) with **seeded varied terrain** — water (river/lake), forest patches, stone/ore deposits, rough/unbuildable ground — generated via engine Perlin noise + region masks (crib Farm Valley's `generateWorld(seed)` pattern). Walkable grid derived from terrain (water/rough = obstacle).
- Render: reuse `@engine/core/render` Canvas2D renderer + Camera2D (pan, 0.5–6× zoom). Static-layer bake the ground. **Placeholder rendering = EDG32 colored rectangles** (no sprites yet) — palette guard must pass.
- Sim loop: deterministic 20Hz scheduler in a Worker (copy farm-valley's worker/sim-client snapshot+interp wiring, strip farm content). `bootstrapSim()` Worker-agnostic so headless run-sim + tests can drive it.
- UI shell: pause + speed controls (engine/farm-valley already have these — crib), minimal HUD frame. Home/loading screens can be stubs.
- Tooling: `npm run dev`/`build`/`typecheck`/`test`/`sim` wired for the new packages.

## Decisions (grilled 2026-06-18)
- Plot 96×96 fixed, 16px tiles (APR #12, #13).
- **Varied terrain with resource nodes** — terrain gen lands here in Phase 0 so later placement can be terrain-aware (APR #22).
- Placeholder EDG32 rectangles first; sprites are Phase 5 (APR #10).
- Determinism load-bearing from day one (APR #13); seeded `Rng`, no `Math.random`/`Date.now`.
- New sibling packages, `@engine/*` only (APR #11).

## Done when
- `npm run dev` opens the citadel client; a 96×96 plot with seeded terrain (water/forest/stone/rough) renders; camera pans/zooms; pause+speed work.
- Same seed → identical terrain (determinism); different seeds → visibly different plots.
- `npm run sim` (headless) runs the empty deterministic loop without a Worker.
- `npm run typecheck` + palette guard pass across the new packages.
