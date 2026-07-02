# Citadel — Asset Critique Checklist & Verdict Rubric

The **grading document** for the Citadel art wave (briefs
[art-04](../todos/2026-07-02-citadel-art-04-personality-and-silhouette.md) /
[art-05](../todos/2026-07-02-citadel-art-05-unit-personality.md) /
[art-06](../todos/2026-07-02-citadel-art-06-asset-showcase-page.md) /
[art-07](../todos/2026-07-02-citadel-art-07-fire-effects.md)). Run it at the **end** of the
work against the [art-06 showcase page](../todos/2026-07-02-citadel-art-06-asset-showcase-page.md)
screenshots (`showcase-noon/dusk/night/fire/isometry.png`) + a live playtest-citadel pass, and
record a **PASS / FAIL verdict** with per-item results.

This is the *what-good-looks-like* acceptance bar. It refines the
[style bible](citadel-art-style.md#per-recipe-checklist) per-recipe checklist (still authoritative
per-sprite) into a **whole-set** review + a scored verdict. Study targets:
[inspirations/CREDITS.md](../../inspirations/CREDITS.md).

## How to run the critique

1. Land art-06 (the showcase harness) so every asset is visible, spaced (no pixel overlap), with
   the isometry-overlay / all-burning / day-phase toggles.
2. Capture the five screenshots + do a live playtest-citadel pass (a populated town, a fire event).
3. Walk **every checklist item below** and mark ✅ / ⚠️ / ❌ with a one-line justification + the
   screenshot it's judged from. `⚠️` = minor, ship-with-note; `❌` = blocker.
4. Apply the **verdict rule** at the bottom.

Each item is written so it's **judged from the artifacts**, not from vibes — most map to a
headless test too (silhouette-mask distance, value-count, AABB non-overlap), so a `❌` should be
reproducible.

---

## A. Silhouette & identity (the "look similar" fix — art-04/05)

- [ ] **A1 — Every building type is unique in solid black.** No two `bld/<type>` share a
      silhouette. (Test: pairwise opaque-mask distance ≥ threshold.) *Judge: isometry shot with
      fill removed / the mask test.*
- [ ] **A2 — Silhouette, not colour, carries identity.** Squint / desaturate the noon shot: you
      can still tell a mill from a chapel from a keep from a house. Cottage-family types (house/
      bakery/smith/healer/woodcutter/sawmill) no longer read as one box re-skinned.
- [ ] **A3 — Roofline variety.** Pitch, ridge direction, dormers/cross-gables vary across the set;
      a *row of houses* isn't a repeated stamp.
- [ ] **A4 — Unit roles read by silhouette (art-05).** The main gameplay roles are distinguishable
      *before* tint (held tool / hat / robe). A farmer ≠ a priest ≠ a soldier in black.
- [ ] **A5 — Raider & crowd variety.** A warband isn't a clone army; the ambient crowd isn't one
      repeated cutout.

## B. Depth & shading (the "flat" fix — art-04, style bible)

- [ ] **B1 — ≥3 hue-shifted value bands per major face.** No single-value walls/roofs. (Test:
      vertical value-count scan on the largest face ≥ 3.)
- [ ] **B2 — Shadows shift cooler/deeper, never collapse to black.** clay→rust→bark, stone→slate→
      navy; the audited `wallDeep` valley present, not a pure-black jump.
- [ ] **B3 — Warm ridge/near-corner kiss** (salmon/gold) on lit roofs & the sunlit corner.
- [ ] **B4 — Cluster dithering between bands** (1px sparse checker) rounds faces — present but
      subtle, never a heavy 50% noise field.
- [ ] **B5 — Committed upper-left sun, consistent everywhere.** Left face/slope lit, right shaded,
      on every asset — no asset lit from the wrong side.

## C. Isometry & form (base-square → narrowing up — art-04/06)

- [ ] **C1 — Volumes sit on a full 2:1 ground diamond** and read as anchored, not floating.
      *(Judge: isometry-overlay shot — the diamond fits the footprint.)*
- [ ] **C2 — Base-square, narrowing upward.** Bodies start at the full base and step IN as they
      rise (tapered towers, hipped/overhanging-then-pulled-in rooflines). (Test: opaque width at
      ground row ≥ width at ridge row, solid forms; open forms exempt.)
- [ ] **C3 — Even dimensions; detail on 2px boundaries** at `ISO_ART_SCALE=2` (no shimmering odd
      1px courses/studs).
- [ ] **C4 — Transparent corners intact.** Top-left pixel `.`; taller/jutting volumes don't poke
      outside the sprite or break footprint sort (far-corner sort still correct in a dense cluster).
- [ ] **C5 — Soft feathered SE contact shadow** on buildings and units; reads as ground contact,
      not a hard bar.

## D. Ground, networks & seams (art-02 carry-over — verify unregressed)

- [ ] **D1 — Roads/bridges read warm, not cold-grey**, as real packed-cobble / timber surfaces.
- [ ] **D2 — No pixel-tangent seams.** Autotiled road/wall/bridge **runs** show no doubled hard
      black line where tiles abut (the soft-warm dithered rim holds). *(Judge: showcase autotile
      runs.)*
- [ ] **D3 — Terrain elevation tiers legible** (fBm quantized to EDG tiers), mottled not flat, and
      biome tints on-palette.
- [ ] **D4 — Selective outlines** — silhouette edges outlined, tile abutments not.

## E. Light, atmosphere & animation

- [ ] **E1 — Day/night wash** warm at dawn/dusk, *gentle* cool at night (never hard blue-black);
      town legible at all four phases. *(noon/dusk/night shots.)*
- [ ] **E2 — Dusk `@lit` window glow** on house/bakery/smith/healer — the strongest cozy cue —
      and warm light-pools at dusk/night.
- [ ] **E3 — fBm haze + soft vignette** present as low-contrast atmospheric drift, not banding.
- [ ] **E4 — Animation reads & is deterministic.** Mill sails rotate; villagers/raiders walk
      (phase-staggered, not lockstep); no jitter/shimmer; all render-clock (no RNG/wall-clock in
      recipes).

## F. Fire effects (art-07 — the "test with fire" ask)

- [ ] **F1 — A burning building reads as ON FIRE at a glance**, not merely sooty-orange — visible
      cozy EDG flame. *(fire shot.)*
- [ ] **F2 — Embers** rise above the flame (sparse warm sparks), capped so a town-wide fire
      doesn't swamp the particle pool.
- [ ] **F3 — Fire-tinted smoke** — dark, warm-underlit plume while burning (not the calm grey
      hearth wisp).
- [ ] **F4 — Warm flickering fire ground-glow** lights the surroundings, stronger at night,
      deterministic flicker.
- [ ] **F5 — Fire cue wins over dusk `@lit` glow** (a burning building shows fire, not window
      glow) and composes with the existing soot/orange-tint (they don't fight).
- [ ] **F6 — Intensity ramps with burn time** (`burningSince`): a fresh ignition flickers small, a
      long fire roars.

## G. Cozy cohesion & legibility (whole-set gestalt)

- [ ] **G1 — Reads as ONE cozy storybook town** — warm-biased, lived-in, friendly rounded forms;
      no asset feels like it's from a different game.
- [ ] **G2 — Lived-in props** (barrels, flower boxes, laundry, wood stacks, awnings, kiln) present
      and varied — the town looks inhabited, not sterile.
- [ ] **G3 — Legible at gameplay zoom**, not just in the showcase close-up — verified in a live
      playtest, not only the contact sheet.
- [ ] **G4 — EDG32 only** — palette guard green; no off-palette literal anywhere.
- [ ] **G5 — No regression** — typecheck green, existing tests green, reloads:0 in the playtest,
      no new page errors.

---

## Verdict rule

Tally the items:

- **PASS** — zero `❌`, and `⚠️` count ≤ 5 with each noted as ship-acceptable. The set is "visually
  good": ship it and log the `⚠️` items as polish follow-ups.
- **CONDITIONAL** — zero `❌` but `⚠️` > 5, OR any `⚠️` on a **headline** item
  (A1, A2, A4, C2, F1, G1). Address the flagged items or get an explicit human waiver before
  closeout.
- **FAIL** — any `❌`. Not visually good; fix the blockers and re-run the critique before verdict.

**Non-negotiable blockers (auto-FAIL regardless of tally):** G4 (off-palette), C4 (broken
transparent-corner / footprint sort), E4/F4 determinism violation (RNG or wall-clock in a
recipe/sim path). These are correctness, not taste.

### Verdict record (fill at closeout)

```
Date:            <YYYY-MM-DD>
Judged from:     showcase-{noon,dusk,night,fire,isometry}.png + playtest run <seed/day>
Results:         A: _/5   B: _/5   C: _/5   D: _/4   E: _/4   F: _/6   G: _/5
❌ blockers:      <list or none>
⚠️ notes:         <list>
VERDICT:         PASS | CONDITIONAL | FAIL
```
