---
title: "Citadel art: external CC0 ingest evaluated (REJECTED) — the real work is silhouette differentiation"
created: 2026-07-11
status: DONE 2026-07-13 (Wave 5, `0d6c1b3`) — the silhouette-differentiation work below shipped; the CC0-ingest spike stays rejected
tags: [citadel, client, render, art, assets, atlas, palette, edg32, cc0, spike-result]
---

# Citadel art — CC0 ingest was spiked and rejected; fix the boxes instead

**Original ask (2026-07-11):** find free online assets that match Citadel, download them,
bake them, use them.

**Outcome: the ingest path was prototyped and does not work.** The spike is recorded below so
nobody re-runs it. It surfaced a *different*, real defect in the current art, which is what
this todo now proposes fixing.

> **📊 See the evidence before you act on this brief.** The two failed spikes, the gamut plot
> that explains *why* they failed, and the contact sheet of the current art are all on the
> verification page: <https://claude.ai/code/artifact/4ba07f60-7c41-48b6-b446-0359a3d2c6e5>
> — sources + rebuild instructions in [../verify/2026-07-11-citadel-art/](../verify/2026-07-11-citadel-art/README.md).

## What was tried

Citadel's art is 100% procedural: ASCII pixel recipes in
[recipes/](../../games/citadel/client/src/render/sprites/recipes/), drawn with the iso
primitives in [iso-draw.ts](../../games/citadel/client/src/render/sprites/recipes/iso-draw.ts),
rasterized by [rasterize.ts](../../games/citadel/client/src/render/sprites/rasterize.ts) and
shelf-packed into a runtime atlas at boot by
[atlas.ts](../../games/citadel/client/src/render/sprites/atlas.ts). No PNG is committed.

The plan was: ingest CC0 iso art → quantize every pixel to EDG32 (`nearestEdg32()` already
exists in [palette.ts](../../engine/core/src/render/palette.ts)) → bake to a committed PNG +
manifest → load it with the recipes as fallback. This would have required amending the
*"No external art pipeline"* line in [decisions.md](../wiki/decisions.md) → **that amendment is
NOT needed; the decision stands as written.**

### The geometry actually lined up

| Constant | Value | Source |
|---|---|---|
| `ISO_TILE_W` / `ISO_TILE_H` | 32 / 16 (2:1 dimetric) | [iso.ts:40-42](../../games/citadel/client/src/render/iso.ts#L40-L42) |
| `ISO_ART_SCALE` | **2** | [iso.ts:135](../../games/citadel/client/src/render/iso.ts#L135) |
| Real building frames | 64×62 (well) → 192×186 (keep); typical **128×92** | rasterized from `BUILDING_RECIPES` |

The best CC0 candidate — [rubberduck's isometric medieval buildings](https://opengameart.org/content/isometric-medieval-buildings)
+ [#2](https://opengameart.org/content/isometric-medieval-buildings-2), genuine CC0, no
attribution required — ships a "64x32" variant that trims to ~255×269, downscaling cleanly to
128×135. **Geometry was never the problem.**

### The palette was the problem — two strategies, both failed

1. **Nearest-color quantize** (weighted RGB distance → `nearestEdg32`): every muted timber and
   roof shingle snapped to **hot rust**. EDG32's only greys are blue-tinted (`#5a6988`,
   `#3a4466`) and its mid-browns are rusts (`#be4a2f`, `#b86f50`). The renders live in the
   desaturated olive-grey midtones that fall in the **gap between those two families**.
   Bayer dithering made it noisier, not closer.
2. **Material-ramp restyle** (classify each pixel into roof/timber/plaster/stone/foliage by
   hue+saturation, then map its *luminance* onto a hand-picked EDG32 ramp per material):
   better hue story, still unusable — **per-pixel speckle**.

**Root cause (the durable lesson):** the source is a *photoreal Blender render*. It carries
photographic texture noise (individual shingles, wood grain) and desaturated midtones. EDG32 is
a **vivid 32-color palette that requires flat, deliberate color fields with intentional
dithering**. Forcing photo-texture into 32 vivid colors at 128px yields speckle regardless of
the mapping function. This is a **gamut + texture-frequency mismatch, not a tuning bug** — a
better quantizer cannot fix it.

> **Corollary for any future attempt:** only ingest art that is *already* low-bit pixel art on
> a limited, vivid palette — then the conversion is near-lossless. A survey of the CC0
> iso-medieval ecosystem (OpenGameArt CC0-Isometric, Kenney Medieval RTS, josepharaoh99's
> packs) found it is **dominated by rendered/photoreal art**; limited-palette iso *pixel* art
> in this genre is scarce. There is no easy win waiting to be downloaded.

### Sources vetted (for the record)

| Source | License | Verdict |
|---|---|---|
| [rubberduck iso medieval buildings](https://opengameart.org/content/isometric-medieval-buildings) + [#2](https://opengameart.org/content/isometric-medieval-buildings-2) | **CC0**, clean | ❌ rendered/photoreal — fails the palette spike. Also only **5 buildings** vs Citadel's 21 types |
| [Kenney Medieval RTS](https://kenney.nl/assets/medieval-rts) | **CC0**, clean | ❌ flat vector, wrong projection |
| [OpenGameArt CC0 Isometric](https://opengameart.org/content/cc0-isometric) | CC0 (per-entry) | ❌ mostly rendered; usable only as *reference* |
| [400+ Isometric Town Tiles](https://opengameart.org/content/400-isometric-town-tiles) | "CC0" but the page admits some tiles are 20+ years old with **authors lost to time** | ❌ **avoid** — unverifiable chain of title is a genuine license risk |

## The real defect the spike exposed → this is the work

Rasterizing all 21 `BUILDING_RECIPES` to a contact sheet shows that **8 of them are the same
box with a different roof colour**: `house`, `bakery`, `woodcutter`, `market`, `public-square`,
`watchpost`, `quarry`, `sawmill`, `smith` are near-identical 128×92 cubes.

This directly contradicts the file's own stated design goal —
[buildings.ts:2-6](../../games/citadel/client/src/render/sprites/recipes/buildings.ts#L2-L6)
claims each type uses "a distinct FORM … so the *silhouette* — not just the colour — tells a
mill from a mine." For those 8 types it is simply **not true**. (Only `mill`, `chapel`, `keep`,
`tower`, `garrison`, `town-hall`, `well` and `farm` currently read at a glance.)

Colour-only differentiation is also the *most* fragile axis in this engine, because the
day/night wash tints everything — at dusk a red-roof bakery and an orange-roof house converge.

### Proposed work

1. **Give each of the 8 box-buildings a distinct silhouette**, composing existing `iso-draw.ts`
   primitives (which are already rich: `isoChimney`, `isoAnvil`, `isoGrainSacks`, `isoCrates`,
   `isoLogPile`, `isoChoppingBlock`, `isoShaftMouth`, `isoQuarryPit`, `isoWaterWheel`,
   `isoBanner`, `isoTurret`…). Bias to **roofline + attached structure + ground props**, not hue:
   - `bakery` — squat + **large domed oven bulge** + chimney with smoke anchor
   - `smith` — open-sided forge canopy + `isoAnvil` + chimney
   - `sawmill` — long low shed + `isoLogPile` + `isoWaterWheel`
   - `woodcutter` — small cabin + `isoChoppingBlock` + stacked logs
   - `market` — already has `marketStalls`; push the **awning** silhouette above the roofline
   - `quarry` — already has `isoQuarryPit`; make the **pit** the dominant read, not the hut
   - `watchpost` — raised platform on posts (tall, thin) — must not read as a house
   - `public-square` — flat plaza + banner; should read as **negative space**, not a building
2. **Use the CC0 renders as visual reference only** (they are genuinely nice medieval forms) —
   no pixels ingested, no licence obligations, no decision amended.
3. **Fix the stale comment** at [buildings.ts:2](../../games/citadel/client/src/render/sprites/recipes/buildings.ts#L2):
   it says art is "authored at 4× (`ISO_ART_SCALE`)" but `ISO_ART_SCALE = 2`.

## Acceptance criteria

- `npm run typecheck` + `npm run test` green, **including the EDG32 palette guard**
  ([palette.test.ts](../../engine/core/src/render/palette.test.ts)).
- **Silhouette test:** each of the 8 types is distinguishable from the others with **colour
  stripped** (render the alpha mask only). Worth adding as a real test — there is already a
  [silhouette.test.ts](../../games/citadel/client/src/render/sprites/silhouette.test.ts) and a
  [unit-silhouette.test.ts](../../games/citadel/client/src/render/sprites/unit-silhouette.test.ts)
  to model it on.
- **Playtested in a real browser** ([playtest-citadel](../../.claude/skills/)) — this is a
  visual change, so unit tests are not the acceptance bar. Screenshots before/after.

## Out of scope

- Any external art pipeline (**settled: rejected — see above**).
- Any change to the EDG32 rule.
- Farm Valley's atlas ([tools/atlas-builder](../../tools/atlas-builder/)).
