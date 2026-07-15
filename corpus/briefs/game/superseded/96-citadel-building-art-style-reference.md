> **CLOSED 2026-07-15 — not scheduled work.** This was always a living art-direction
> reference mis-filed in `todo/`, never a task. Removed from the queue. Its unique
> content (the reference-asset section) should be folded into
> [wiki/citadel-art-style.md](../../../wiki/citadel-art-style.md) by whoever next
> touches the art pages.

# Brief 96 — Citadel building art-style reference (the look + example assets)

> 📌 **NOT SCHEDULED WORK.** This is a **living reference**, not a task, and it should not be read as
> something in the queue. It sits in `todo/` only because that is where it was written.
>
> It belongs in `wiki/` beside [citadel-art-style.md](../../../wiki/citadel-art-style.md), but the two
> overlap substantially (shading rules, hard constraints, verification checklist) and merging them
> would exceed the corpus's ~200-body-line page cap — so the move needs a real split, not a `git mv`.
> Filed as a corpus-hygiene job for whoever next touches the art pages. The unique content here is the
> **reference-asset section**, which the style bible does not carry.

Status: **living reference (not scheduled).** This is the standing art-direction spec for
Citadel building sprites — the look to match when adding/restyling any building.
It captures the reference assets the user provided and the rules the current
generators follow. Not a one-shot task; keep it open and update as the style
evolves. (Implementation history: briefs
[95](../done/95-citadel-building-restyle-reference-look.md) restyle + the
2026-06-21 log entries for the FORMS pass, mill/well rebuild, and light-pool fix.)

## Why

Citadel buildings are **procedurally generated pixel-art recipes** (ASCII grids,
not committed PNGs). To keep ~20 building types visually coherent and on-theme as
the set grows, the art direction needs a written reference: the target look, the
example assets it's modelled on, the palette, and the structural rules. Without it,
each new building drifts.

## Reference assets (inspiration only — NOT imported)

The user supplied these as the visual target. We **evoke** them procedurally and
stay EDG32-only; we do **not** import the art (keeps "assets are code" + the EDG32
guard intact, no licensing/attribution burden).

- **Reiner's "Isometric Buildings"** (CC-BY-SA, OpenGameArt) — the primary
  reference. Warm terracotta tile roofs with visible ridge + eave overhang;
  half-timbered (dark oak frame + diagonal cross-braces over cream/wattle infill);
  weathered timber; each building on a small ground plot with scattered props
  (barrels, sacks, fences); tall timber-lattice watchtower/mill; an open fenced
  crop/flower field; a market with red-striped stalls.
- **zatoart "Isometric Isolation"** — 32×32 true-iso, clean medieval, 100+ tiles.
- **zatoart "Isoverse Medieval Outdoors"** — 2:1 true-iso, "clean & readable",
  cohesive blended palette, modular buildings w/ visible entrances, market stalls,
  barrels, fences, walls, towers, lamps/torches.
- **xilurus "Pixel Isometric Village"** — 16×16 iso; ground/slope/slab variants,
  minerals, flora, structures.

Common thread across all four (the target): **clean, readable 2:1 dimetric iso;
warm terracotta tile roofs; timber/stone modular bodies; props + ground bases;
fences, market stalls, towers; a cohesive multi-step (not flat) palette.**

## Art-style rules (what the generators do — keep matching this)

- **Projection:** true 2:1 dimetric iso. Each building is a real volume — a
  diamond ground footprint + two shaded wall faces (lit-LEFT, shaded-RIGHT; one
  committed sun from the upper-left) + a roof. Silhouette, not just colour, must
  distinguish a type (see FORMS below).
- **Resolution:** 32-based (`ISO_ART_SCALE = 1` in
  [iso.ts](../../../games/citadel/client/src/render/iso.ts)) — same density as
  units/terrain. (4× was tried and reverted; 32 is dense enough.)
- **Palette: EDG32 only**, via the `SWATCH` chars in
  [palette.ts](../../../games/citadel/client/src/render/sprites/palette.ts) (a
  guard test fails on any off-palette colour). Key roles:
  - Terracotta tile roof: `R` rust (shadow) → `r` clay (mid) → `P` salmon (lit);
    ridge cap + dark eave-overhang line in `%` bark / `#` black.
  - Plaster/wattle wall infill: `c` cream / `t` tan; **oak half-timber framing**
    in `%` bark / `W` woodDark (studs + sill/top plates + a diagonal cross-brace).
  - Stone (forts/quarry/mine/well): `s` steel / `S` slate / `l` silver / `i` ink,
    ashlar coursing as sparse staggered blocks (NOT a per-pixel checkerboard).
  - Accents: `O` gold / `o` orange / `y` yellow (fire, brass), `e` red + `v` white
    (market awning stripes), `g`/`G`/`d` greens (fields, healer roof), `b`/`B`/`C`
    blues (glass, water).
- **Shading:** ≥3 steps per surface (lit / mid / shadow) — avoid flat fills.
  Selective dark outline around the silhouette + eaves; avoid noisy interior lines.
  **Roof faces must read as three distinct VALUES** (lit / mid / shadow); never let
  the shadow side collapse to pure black — use a dark *shade* (`i` ink) instead, per
  the iso-art "valley corners = darkest-shade-not-black" rule (2026-06-26 grounding
  pass: `STONE`/`WOOD` `roofDark` moved `#`→`i`).
- **Ground anchoring + AO (2026-06-26, applies to every `begin()` form):** each
  building bakes a **contact shadow** — the footprint diamond flattened + pushed
  SE (opposite the upper-left sun), in `i` ink, drawn FIRST so the body paints over
  all but the SE sliver, with a dithered/feathered rim so it reads soft not as a bar
  (`isoContactShadow`). Plus **ambient-occlusion seams**: a 1px shaded band along the
  wall-top under the roof eave, and a gentle mid-shade seam right of the lit near
  corner (tall walls only). This is the single biggest legibility lift — buildings
  read as planted on the terrain, not floating cut-outs. (Reference: SLYNYRD
  Pixelblog 41/54, PixelParmesan "Fundamentals of Isometric Pixel Art" — a
  grid-aligned cast shadow + distinct per-face values are the core iso reads.)
- **Ground + props:** emitters/dwellings get a small dirt apron + a barrel/sack at
  the front base (`isoGroundProps`), like the reference plots.
- **Per-type FORMS** (builders in
  [iso-draw.ts](../../../games/citadel/client/src/render/sprites/recipes/iso-draw.ts),
  mapped in
  [buildings.ts](../../../games/citadel/client/src/render/sprites/recipes/buildings.ts)):
  - `cottage` — half-timber + steep terracotta hip roof + window/door:
    house, bakery, woodcutter, sawmill, smith, healer.
  - `postMill` (tower mill) — tall tapered round stone tower, domed clay cap,
    big front-facing **animated** sail X (`bld/mill@0..7`, `millFrameAt`).
  - `openField` — tilled furrows + post-and-rail fence + gate + crops + hay: farm.
  - `marketStalls` — cobble plaza + red/white striped stall awnings + goods.
  - `church` — nave + bell tower + spire + cross: chapel.
  - `warehouse` — long body + barn doors + hayloft dormer: storehouse,
    tradingpost, town-hall.
  - `fort` — ashlar stone + flat **crenellated** deck + arrow slits + banner:
    watchpost, tower, garrison, keep.
  - `boxBuilding` — mine pithead / quarry pit / well (`wellForm`: small roofed
    well-head, not a building box).
- **FX:** the night light-pool glow is a soft `fx/diamond` pool on the GROUND
  (below buildings), warm gold/orange, low alpha — lamplight, never a hard box
  over the sprite ([atmosphere.ts](../../../games/citadel/client/src/render/atmosphere.ts)).

## Hard constraints

- **Render-only / deterministic** — recipes + atlas are pure; no sim impact. Mill
  animation uses the main-thread render clock only.
- **EDG32 guard** + **recipes.test.ts** (rectangular rows; width % TILE_SIZE === 0;
  per-type opaque-fraction floors, with farm/market/mill relaxed as sparse forms;
  unique frame names; `@`-frames excluded from `BUILDING_SPRITE_TYPES`).
- `isoSpriteDims` is the renderer's world-px source of truth; `BUILDING_HEIGHT_TILES`
  in citadel-renderer.ts must match each form's `heightTiles` or the art floats.

## How to verify a new/changed building matches the style

1. Rasterize the recipe to a PNG (temp `tsx` script over `rasterizeRecipe`) and
   eyeball: terracotta roof? timber/stone coursing? readable silhouette vs the
   other types? on-plot props?
2. In-game Playwright pass (real runtime atlas + actual client): place it, zoom in,
   confirm it renders its sprite (no orange/grey fallback box), sits on its
   footprint, depth-sorts, and the night glow reads as a ground pool.
3. `npm run typecheck -w @citadel/client` + `npm run test -w @citadel/client` +
   the engine EDG32 palette test — all green.

## Units + terrain (the same grounding/value rules apply)

The 2026-06-26 grounding pass was extended to units + terrain, so the look is now
cohesive across all three surfaces:
- **Units** ([units.ts](../../../games/citadel/client/src/render/sprites/recipes/units.ts)):
  authored as a GREY RAMP (`#`→`S`→`l`→`v`) so the per-instance state/strength tint
  multiplies in. They carry a **`footShadow`** ground anchor (darkest ramp chars, so
  it stays shadow under any tint) and a **3-value body** (lit-left/mid/shaded-right)
  so a tinted figure reads as volume, not a flat cut-out.
- **Terrain** ([terrain-dither.ts](../../../games/citadel/client/src/render/terrain-dither.ts)):
  the base diamond fill is **elevation-banded** (`elevationFill`: dark accent in
  valleys, light on highs, base in the middle) so the ground reads as gently rolling
  land; the existing sub-tile dither specks share the same elevation field.

## Out of scope

- New standalone prop/decor sprites (barrels, lamps, trees as placeable objects) —
  would need sim/placement hooks; separate brief.
