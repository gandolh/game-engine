---
title: "Citadel art-06 — all-assets showcase page (spaced, isometry + fire test harness)"
created: 2026-07-02
status: todo
tags: [citadel, client, render, art, tooling, showcase, test-harness]
depends-on: []  # can land first — it's the acceptance harness the other art briefs verify against
scope: BRIEF-ONLY (no implementation yet — spec + acceptance)
---

# art-06 — All-assets showcase page (the visual acceptance harness)

## Why

The user asked for **"a page with all the assets put on the map with spacing between them so
that pixels don't overlap,"** to **test the isometry** (base-square → narrowing upward) and to
**test fire effects**. Today there is **no such page** — art gets eyeballed via the
playtest-citadel driver on a live economy, where buildings overlap, fires are incidental, and
you can't see every asset at once. A dedicated showcase is the harness the other art briefs
(art-04 silhouette, art-05 units, art-07 fire) verify against, and it doubles as a regression
catcher (one screenshot shows the whole atlas).

## Goal / acceptance

A **showcase mode in the real Citadel client** (WebGPU, the real atlas + renderer — not a
mock) reachable by a URL flag (e.g. `?showcase` / `#showcase`, DEV-only, alongside the existing
`window.__citadel` dev hook in [main.ts](../../games/citadel/client/src/render/../main.ts)) that:

1. **Lays EVERY asset on the iso grid with generous spacing so no two sprites' pixels
   overlap.** Grid pitch ≥ the widest sprite footprint + a margin (compute from
   `isoSpriteDims` / the recipe widths, don't hardcode). Assets covered:
   - every `bld/<type>` building (all 21 types),
   - the mill sail-rotation frames + every `@lit` dusk variant (in a labelled row),
   - units: villager + raider walk-cycle frames, pedestrian, and (once art-05 lands) each role
     silhouette,
   - fx: `fx/road`, `fx/bridge`, `fx/diamond`, and autotiled road/wall/bridge **runs** (so
     abutment/pixel-tangent seams are visible),
   - terrain tiles (each biome + elevation tier from `terrain-dither.ts`).
2. **Labels each asset** with its frame name (tiny in-canvas text via the existing text
   system, or a DOM overlay) so a screenshot is self-documenting.
3. **Isometry check affordance:** a toggle that overlays the **2:1 ground diamond + a vertical
   ruler** behind each building, so you can visually confirm the volume starts at the full
   square base and narrows going up (tapered towers, hipped/overhanging rooflines). This is the
   direct visual form of the art-04 "base-width ≥ ridge-width" invariant.
4. **Fire test affordance:** a toggle that sets **every building `burning`** (and a second
   state `onFire`) so the full fire treatment (art-07: flame sprite + embers + soot + orange
   wash + smoke) is visible on every silhouette at once — the "test with fire effects" ask.
   Also a **day-phase scrubber** (dawn/noon/dusk/night) driving the same wash/`nightFactor` the
   game uses, so `@lit` glow, light pools, and the fire glow are all checkable in one place.
5. **Screenshot capture:** extend the playtest driver (or a sibling
   `.claude/skills/playtest-citadel/showcase.mjs`) to open the showcase, toggle each affordance,
   and shoot `showcase-noon.png`, `showcase-dusk.png`, `showcase-night.png`,
   `showcase-fire.png`, `showcase-isometry.png`. These are the **acceptance artifacts** the
   art briefs are reviewed against (kept out of git, like the other playtest evidence).

## Work

1. **Showcase scene builder** (client, DEV-only) — enumerate `ALL_RECIPES` +
   `BUILDING_SPRITE_TYPES` + terrain/autotile sets, place them on a padded iso lattice via the
   real world→screen transform, feed the same `pushScene` / `endFrame` path so lighting/wash/FX
   are identical to gameplay. No sim, no economy — a static decorative snapshot list.
2. **Overlay toggles** — diamond+ruler, all-burning, day-phase scrub — as small render-only
   switches (mirror the existing `renderToggles` pattern in main.ts).
3. **Spacing math** — pitch from the max sprite dims so the "pixels don't overlap" guarantee is
   structural, not eyeballed; add a headless unit test that asserts, for the showcase layout,
   **no two sprite AABBs intersect** (cheap correctness net without a browser).
4. **Capture script** in the playtest skill; document it in the skill's SKILL.md.

## Constraints

- **DEV-only** — gate on `import.meta.env.DEV` like `window.__citadel`; never ship the showcase
  in a production build.
- Reuse the **real** renderer/atlas/wash/FX — the whole point is testing the shipped art, so no
  parallel mock render path.
- Deterministic layout (sorted asset list) so screenshots diff cleanly across runs.
- Palette guard / typecheck green; the AABB-non-overlap test is the headless acceptance, the
  screenshots are the visual one.

## The critique harness

art-06 is what the [asset critique rubric](../wiki/citadel-asset-critique.md) is **run
against** — the five capture screenshots (`showcase-{noon,dusk,night,fire,isometry}.png`) are
the rubric's judged artifacts, and the isometry-overlay / all-burning / day-phase toggles exist
specifically so sections A/C/E/F can be graded. Landing this first unblocks grading the others.

## Notes

- This is the ONE art brief that's mostly **tooling**, not recipe art — it unblocks visual
  verification for art-04/05/07 (and future art work), so it's reasonable to land it FIRST.
- Reference layout inspiration: the CC0 packs in
  [inspirations/CREDITS.md](../../inspirations/CREDITS.md) ship exactly this kind of "all tiles
  on one sheet" contact sheet — mirror that legibility.
