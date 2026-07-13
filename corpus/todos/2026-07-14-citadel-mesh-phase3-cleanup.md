---
title: "Citadel mesh renderer — Phase 3 polish + cleanup (follow-up to the 3D-mesh rebuild)"
created: 2026-07-14
status: todo (deferred polish; the mesh rebuild core is DONE + shipped)
tags: [citadel, client, render, mesh, cleanup, tests, tech-debt]
---

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
