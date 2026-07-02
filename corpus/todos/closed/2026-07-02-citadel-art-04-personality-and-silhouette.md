---
title: "Citadel art-04 — building personality & silhouette de-samification"
created: 2026-07-02
status: done
tags: [citadel, client, render, art, isometric, pixel-art, buildings, silhouette]
depends-on: [art-01, art-02, art-03]  # ships on the 2× scale + cozy palette already landed
scope: BRIEF-ONLY (no implementation yet — spec + acceptance)
---

# art-04 — Building personality & silhouette de-samification

## Why (the problem, code-grounded)

The buildings "look kind of similar and flat." Root cause is **form-family collapse**, not
palette — verified against
[`buildings.ts`](../../games/citadel/client/src/render/sprites/recipes/buildings.ts) +
[`iso-draw.ts`](../../games/citadel/client/src/render/sprites/recipes/iso-draw.ts):

- **`cottage()` is reused for 6 building types** (house, bakery, woodcutter, sawmill, smith,
  healer) — identical steep-gable half-timber box, distinguished ONLY by an `IsoPalette` swap
  and one small `accent` (a chimney, an anvil, a cross). The silhouette is the same.
- **`warehouse()` covers 3** (storehouse, tradingpost, town-hall); **`fort()` covers 4**
  (watchpost, tower, garrison, keep); **`boxBuilding()` covers 2** (quarry, mine).
- **One roof pitch** (`drawGableRoof` `riseMul≈2.1`) and one ridge orientation across the
  whole cottage family → rooflines read identical in silhouette.
- Personality currently rides on **accents that don't alter the silhouette** (chimney, anvil,
  cross, banner). Per SLYNYRD 41/54 + Pixel Parmesan (see
  [inspirations/CREDITS.md](../../inspirations/CREDITS.md)), a building must be recognisable
  **in solid black** — silhouette, not colour, carries identity.

So art-04 pushes personality **into the silhouette**: roofline, height, footprint break-up,
ridge direction, porches/lean-tos, and material-specific volumes — while staying inside the
[cozy style bible](../wiki/citadel-art-style.md) (2:1 dimetric, committed UL sun, EDG32,
deterministic, base-square-narrowing-upward).

## Goal / acceptance

- **Silhouette test (the headline):** every building type is **uniquely identifiable from its
  solid-black silhouette alone** — no two types share a silhouette. Add a test that rasterizes
  each `bld/<type>`, reduces to an opaque-mask bitfield, and asserts **pairwise mask distance ≥
  a threshold** (e.g. Hamming distance over the normalized footprint) so a future palette-only
  re-skin can't collapse two forms. (Complements the existing opaque-fraction floor in
  [recipes.test.ts](../../games/citadel/client/src/render/sprites/recipes.test.ts).)
- **Depth test ("not flat"):** each building's largest wall/roof face shows **≥3 distinct
  EDG values** in a vertical scan (a mask/histogram assertion), and the roof shows a warm
  ridge kiss. This makes "flat" a testable regression, not a vibe.
- **Isometry test:** every volume reads as **base-square → narrowing upward** (tapered
  towers, hipped/overhanging-then-pulled-in rooflines). The showcase page (art-06) is the
  visual acceptance; add a cheap invariant here — the opaque **width at the ground row ≥ width
  at the ridge row** for solid-bodied forms (open forms — farm/market/plaza — exempt, same as
  the LOW_FLOOR set).
- Still: palette guard green, typecheck green, determinism (render-clock only), and
  **verified in a real browser** (playtest-citadel) — not just unit tests
  (per [memory: verify UI in a browser](../../CLAUDE.md)).
- **Final grade:** passes the whole-set [asset critique rubric](../wiki/citadel-asset-critique.md)
  — this brief owns sections A (silhouette/identity), B (depth/shading), C (isometry/form).

## Work (per family — new/varied FORMs, then re-point recipes)

Each item is a new or parameterised `iso-draw` FORM builder giving a distinct **silhouette**,
composed in `buildings.ts`. Keep every existing palette/accent already landed by art-02.

1. **Break the cottage monoculture (highest leverage).** Give the 6 cottage-family types
   silhouette identity:
   - **house** — keep the canonical cottage (the reference form), but add roofline variants
     (a cross-gable / an L-jog) selectable by `groundSeed` so a *row of houses* varies.
   - **bakery** — squatter, wider body + a **big external bread-oven bulge** (a rounded stone
     kiln volume on one side) + the fat chimney → unmistakable profile.
   - **smith** — **open-fronted forge**: a lean-to half-roof (one slope, not a full gable) over
     an open bay, tall stone chimney; darker, industrial silhouette.
   - **healer** — a taller narrow apothecary with a **jettied (overhanging) upper storey** and
     the green roof + cross; verticality distinguishes it from the house.
   - **woodcutter / sawmill** — a **timber lean-to shed** (mono-pitch roof) rather than the
     symmetric cottage; sawmill keeps the waterwheel volume, woodcutter the covered log store.
2. **Roof-pitch & ridge-direction parameters.** Extend `drawGableRoof` so a form can pick
   ridge orientation (NE–SW vs NW–SE) and pitch (`riseMul`), plus optional **cross-gable** and
   **dormer** volumes — the cheapest silhouette diversifier across the whole set.
3. **Civic / storage differentiation.** `warehouse()` town-hall vs storehouse vs tradingpost
   currently near-identical: give **town-hall** a clock/bell gable + a porch/portico volume,
   **tradingpost** a market-canopy lean-to, **storehouse** the plain barn. Distinct rooflines.
4. **Fort family.** watchpost / tower / garrison / keep share `fort()` at different sizes —
   push silhouette apart: watchpost = small timber-roofed lookout (not flat crenellations),
   tower = tall round drum, garrison = long low hall + gatehouse, keep = big square donjon +
   corner turrets. Height alone isn't enough; vary top treatment.
5. **Personality props as silhouette, not just fill.** Where a prop defines the building
   (mill sails, waterwheel, market awnings, kiln, forge canopy) make it break the outline, not
   sit inside it.

## Constraints / guardrails

- **`iso-draw.ts` is the shared engine of ALL building forms** — additive new builders +
  optional params; don't regress existing forms (art-01/02/03 all green). Every form still
  goes through `begin()` (bakes the contact shadow) + the committed-UL-sun value order.
- **Even dimensions, details on 2px boundaries** at `ISO_ART_SCALE=2` (per-recipe checklist).
- **Multi-tile footprints must still sort by their FAR corner** (`isoFootprintBox`) — taller/
  jutting volumes must not poke outside the sprite's transparent-corner invariant (the
  top-left pixel stays `.`, asserted by recipes.test.ts).
- Keep the `@lit` dusk-glow companion frames (art-02) in lockstep with any reshaped cottage.
- This is a **fidelity/silhouette** pass — do NOT touch projection/depth math, the sim, or
  determinism.

## Out of scope (own briefs)

- Unit/character personality → **art-05**.
- Fire/ember/flame FX → **art-07**.
- The all-assets showcase page (the visual acceptance harness) → **art-06**.
