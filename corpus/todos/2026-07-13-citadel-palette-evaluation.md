---
title: "Citadel palette re-evaluation — is EDG32 the right fit for a cozy medieval town?"
created: 2026-07-13
status: todo (design question — capture only; NOT approved to build)
tags: [citadel, client, render, art, palette, edg32, decisions, design-question]
---

# Should Citadel move off EDG32? — a palette re-evaluation

**Ask (2026-07-13, user):** *"Maybe we should change the palette for the Citadel assets. What
palette do you think fits best?"* Captured as a design question. **This is not approved work** —
EDG32 is a **locked convention** (see the ⚠️ below); this todo records the case, a recommendation,
and the questions that must be answered before any code moves.

## Why the instinct is sound — EDG32 genuinely misfits the medieval look

This isn't speculation; the [CC0 art-ingest spike](closed/2026-07-11-citadel-external-cc0-art-ingest.md)
already measured it. When it tried to quantize real medieval iso art to EDG32, **every muted timber
and roof shingle snapped to hot rust**, because of a specific gamut gap:

- EDG32's only greys are **blue-tinted** (`#5a6988`, `#3a4466`); its mid-browns are **rusts**
  (`#be4a2f`, `#b86f50`). The desaturated **olive-grey / warm-neutral midtones** that weathered
  timber, thatch, and stone live in fall in the **gap between those two families** — EDG32 has no
  home for them.
- EDG32 is a **vivid, warm, general-purpose** 32-colour palette (built for characters and punchy
  scenes). A cozy medieval settlement wants **earthy, muted naturals** — mossy greens, warm greys,
  ochres, dun browns — which EDG32 is thin on.
- Colour is also the **most fragile axis in this engine**: the day/night wash tints everything, so
  at dusk a red-roof bakery and an orange-roof house converge. Wave 5 just spent an entire pass
  giving 8 buildings distinct *silhouettes* precisely because their *colour* differentiation
  collapsed under the wash. A palette with better-separated natural hues would ease that pressure.

So the misfit is real and documented. The open question is whether it's worth the (large) cost to
fix by swapping palettes vs. living with it.

## Recommendation

**Best fit: Apollo (46 colours, by AdamCYounis).** It's a widely-used, carefully-ramped palette
designed around **natural material ramps** — full blue, green, brown, and warm-neutral ramps with
the **desaturated earthy midtones EDG32 lacks**. It's a proven environment/landscape/medieval
palette, and 46 colours is a **modest, controllable** expansion (smoother material shading without
becoming a free-for-all). It directly fills the gamut gap the spike found.

**Runner-up: Resurrect 64 (by Kerrie Lake).** 64 colours, extremely versatile, excellent warm+cool
naturals (greens/browns/greys). Choose this if maximum material fidelity and smoother gradients
matter more than palette discipline — at the cost of a bigger palette and a larger migration.

**Baseline / do-nothing: keep EDG32.** Lean on silhouette + prop differentiation (the Wave 5
direction) and accept the warm/vivid skew as a stylistic choice rather than a bug.

Palettes considered and rejected for this use: 16-colour sets (Sweetie-16, etc.) — **too few** for
21 building types × materials; moody/limited sets (Vinik24, Nyx8, SLSO8) — wrong mood for *cozy*.

## ⚠️ Why this is a big deal, not a quick swap (read before scoping)

1. **EDG32 is a locked decision.** [decisions.md](../wiki/decisions.md) enforces *"every colour from
   `EDG.*`"* with a **guard test** ([palette.test.ts](../../engine/core/src/render/palette.test.ts))
   that walks `engine/`, `games/`, and `tools/` and fails on any off-palette literal. Changing the
   palette **relitigates a locked convention** and needs explicit user sign-off + a decisions.md
   amendment. The art-ingest spike explicitly did **not** amend it.
2. **The palette is engine-level and SHARED by both games.** `EDG.*` lives in
   [engine/core/src/render/palette.ts](../../engine/core/src/render/palette.ts) and is consumed by
   **Farm Valley *and* Citadel** — sprites, tiles, particles, the day/night wash, and HTML/canvas
   UI. A **Citadel-only** palette therefore requires **decoupling the palette per-game** first (the
   engine is generic and must not know about a game's palette) — a real architectural change, not a
   constant swap. Alternatively, swapping EDG32 outright would restyle **Farm too** (Farm is in
   maintenance — almost certainly unwanted).
3. **Migration surface is wide.** Every Citadel recipe palette (`PLASTER`, `WOOD`, `STONE`,
   `MARKET`, `FORT`, `GREENROOF`, …), the day/night wash ramp, particles, and all Citadel HTML/canvas
   UI colours would be re-picked against the new palette, then re-critiqued
   ([citadel-asset-critique.md](../wiki/citadel-asset-critique.md)) and browser-verified.

## Open questions to resolve before any work

- **Citadel-only, or engine-wide?** If Citadel-only, we first need a per-game palette seam (how does
  a game inject its palette while the guard test still enforces *a* fixed palette per game?).
- **Amend or keep the locked decision?** Requires an explicit decision entry either way.
- **Migration strategy:** big-bang re-pick vs. an automated nearest-colour remap of the existing
  `EDG.*` role constants onto the new palette as a starting point, then hand-tune.
- **Scope of the guard test** under two palettes (one per game).

## Suggested next step (if pursued)

A small, low-risk **spike**: hard-code an Apollo-46 constant set alongside EDG32, re-pick just the
~6 Citadel `IsoPalette` role constants against it, render the Wave-5 building set in `?showcase`
under both palettes, and compare **in the day/night wash**. Decide from the side-by-side before
committing to the architectural per-game-palette work. Do **not** touch the guard test or Farm in
the spike.

## Out of scope (unless explicitly expanded)

- Changing Farm Valley's palette.
- The external art pipeline (settled: rejected — see the art-ingest todo).
