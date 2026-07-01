---
title: "Citadel art 01 — style bible + 2× scale flip (the gate)"
created: 2026-07-01
status: todo
tags: [citadel, client, render, art, isometric, pixel-art]
---

# Citadel art 01 — style bible + 2× scale flip (the gate)

The **gate** for the whole cozy-art upgrade. Establishes the style reference and flips the
global authoring resolution to 2×, verifying the scene stays correct **before** any per-
category polish. Grounded by the [research survey](2026-07-01-citadel-iso-pixel-art-quality-research.md);
rules in the [style bible](../wiki/citadel-art-style.md).

> **Why this gates everything:** `ISO_ART_SCALE` is a **single global constant**
> ([iso.ts:247](../../games/citadel/client/src/render/iso.ts)). It can't flip per-category —
> once it's `2`, every recipe authors at 2×. The recipe code was written for ≥4× detail; at
> 1× the `R(n * ISO_ART_SCALE / 4)` terms collapse to 1–2px. Flipping to 2× recovers the
> headroom that the [art-02 fidelity pass](2026-07-01-citadel-art-02-recipe-fidelity-pass.md)
> assumes. A category not yet re-authored just renders its 1×-era code at 2× (harmless).

## Tasks

### A — Style bible + palette-role audit (no code)
1. Confirm/curate the [cozy iso style bible](../wiki/citadel-art-style.md) as the reference.
2. Audit every `IsoPalette` in
   [`buildings.ts`](../../games/citadel/client/src/render/sprites/recipes/buildings.ts)
   (PLASTER/STONE/WOOD/MILL/CREAM/MARKET/FORT/GREENROOF). For each, note where
   `roofDark`/`wallR` is a *straight-darker* step vs a *hue-shifted* one, and plan the
   warm/cool ramp swaps (roof shadow → `rust`/`bark`; stone shadow → `slate`/`navy`; warm
   ridge kiss → `salmon`/`gold`). Output: a short table the art-02 pass consumes. No edits yet.

### B0 — Flip `ISO_ART_SCALE = 2` + verify (the gate)
1. Set `ISO_ART_SCALE = 2` in [iso.ts](../../games/citadel/client/src/render/iso.ts); update
   the now-stale doc comments (they still say "1× / native / 4× reverted"). Leave the knob +
   `isoArtDims` intact; add a one-line note that **4× remains a future option** via the same knob.
2. **Verify (must all pass before art-02):**
   - Atlas still shelf-packs to a valid **pow2** within memory budget — inspect `packShelf`
     output dims in [`atlas.ts`](../../games/citadel/client/src/render/sprites/atlas.ts)
     (a temp `tsx` raster-dump script per brief 95's method).
   - Boot raster time acceptable (rough timing on the dump).
   - **No layout drift**: buildings still anchor to their diamonds, nothing clips its quad,
     contact shadows stay inside the sprite bounds (recipe opaque-fraction / transparent-corner
     guards stay green).
   - Projection/depth unchanged (it must be — scale only touches texture detail).
3. `npm run typecheck` + `npm run test -w @citadel/client` green (esp. recipe/rasterize/palette tests).
4. **Browser check** (playtest-citadel) at real zoom: the scene renders, sharper; no obvious
   clipping/misalignment. Screenshot for the before/after baseline.

## Acceptance
- `ISO_ART_SCALE = 2`; comments corrected; 4× noted as future.
- Palette-role audit table produced (feeds art-02).
- Atlas pow2 + memory OK; no layout drift; palette guard + typecheck + tests green.
- Verified in a real browser at real zoom (not just unit tests) — per
  [verify-ui-in-browser-before-done]. Before/after screenshot captured.

## Notes
- This phase intentionally does **not** add dithering/hue-ramps — that's art-02, on this
  confirmed 2× base. Keeping the flip isolated makes any regression easy to bisect.
