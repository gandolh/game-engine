---
title: "Citadel mesh renderer — Phase 3 polish + cleanup (follow-up to the 3D-mesh rebuild)"
created: 2026-07-14
status: done (2026-07-14, `dfd754d`)
tags: [citadel, client, render, mesh, cleanup, tests, tech-debt]
---

> **✅ DONE 2026-07-14 (`dfd754d`).** Items 1–3 shipped; item 4 (model tuning) skipped as the
> todo marked it optional. Outcome:
> - **@lit night frames** are mesh-rendered. The mesh renderer gained an **emissive material**
>   path (emissive → one flat tone for every face orientation, skipping the normal-quantized
>   shading ramp), and house/bakery/smith/healer gained real **window geometry**: a dark recessed
>   pane by day, warm lamplight (`lampGlow`) at night; the smith's hearth also runs hotter
>   (`hotEmber`). **Anti-drift by construction** — a lit frame calls the SAME day-frame factory and
>   remaps tri materials (`mesh/models/lit.ts`), so day and lit can only differ in which materials
>   emit, never in shape.
> - **Dead code removed:** `iso-draw.ts` (1990 lines) + the `BUILDING_RECIPES` char bodies +
>   `roof.test.ts`. Net **−1,964 lines**. `recipes/buildings.ts` survives as a frame-NAME-only leaf.
> - **Tests now grade what renders:** the silhouette/recipe guards read `MESH_OVERRIDES` (the exact
>   rasters `atlas.ts` bakes) instead of the char recipes they were silently still grading.
>
> **Two load-bearing findings (do not re-derive):**
> 1. **`BUILDING_SPRITE_TYPES` is the dangerous seam.** It (and the atlas) used to derive from
>    `BUILDING_RECIPES`; deleting the recipes without re-deriving from `MESH_MODELS` would have made
>    every building silently fall back to a tinted box (no crash, no failing test). It now derives
>    from `MESH_MODELS` — the thing that actually rasterizes — so the type set cannot claim art that
>    never renders.
> 2. **Import cycle.** The barrel (`recipes/index.ts`) now imports `MESH_MODELS`, so anything under
>    `mesh/models/` that reaches back through the barrel closes a cycle and leaves `MESH_MODELS`
>    **undefined at module-eval time** (it bit `industry.ts`, which wanted `millFrameName`). Mesh
>    models must import frame names from the **leaf** `recipes/buildings`, never the barrel.
>
> Gates: typecheck clean; full suite **1376 passing**; Apollo palette guard green. Verified on a
> **real GPU** (system Chrome + `--enable-unsafe-webgpu`; the bundled Chromium still can't).

# Phase 3 — mesh renderer polish + dead-code cleanup

The [3D-mesh building rebuild](closed/2026-07-13-citadel-3d-box-asset-renderer.md) shipped all 21
buildings as meshes (`6cc32fb` + `d1e7c7c`), browser-approved. These deferred items remain — none
block gameplay; they're consistency + tech-debt:

1. **`@lit` night frames.** `house`, `bakery`, `smith`, `healer` have separate `@lit` glow frames
   still on the OLD char recipes — at night those four show the old style while their day frames are
   meshes. Port the `@lit` variants to the mesh pipeline (a lit material variant / emissive window
   quads).
2. **Dead-code removal.** With all 21 base frames overridden by `MESH_OVERRIDES`, the old
   `iso-draw.ts` 2D primitives + the `BUILDING_RECIPES` char bodies are largely unused (except the
   still-char `@lit` + any non-building recipes). Once (1) lands, delete the superseded char-recipe
   building code + unused `iso-draw` primitives.
3. **Tests through the atlas.** `silhouette.test.ts` / `buildings-silhouette.test.ts` / recipe tests
   read `BUILDING_RECIPES` (char recipes) directly, NOT the atlas frames — so they pass but **no
   longer cover what actually renders**. Re-point them at `MESH_MODELS` / the rendered atlas frames so
   the mesh silhouettes are regression-guarded headlessly.
4. **Minor model tuning (optional, from the review):** the mill tower body is short (sails carry the
   read); the smith awning plane is slightly prominent. Fine as-is; revisit only if they bug at
   gameplay zoom.

## Acceptance
- Night `?showcase` shows the four `@lit` buildings in the mesh style (no old-char fallback).
- No unused char-recipe/`iso-draw` building code left in the tree.
- A headless test fails if a mesh building's silhouette regresses.
- typecheck + `@citadel/client` + Apollo palette guard green.
