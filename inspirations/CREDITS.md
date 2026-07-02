# Inspirations — reference art credits & study notes

**Reference-only. NOTHING in this directory enters the build.** Citadel's art is
*procedural code* (ASCII `PixelRecipe` grids → one atlas at boot), palette-guarded to
**EDG32**, with no image-import path. External art can't be sampled — it would fail the
palette guard and break the deterministic "assets are code" invariant (see
[decisions.md](../corpus/wiki/decisions.md) + the
[iso-art research survey](../corpus/todos/2026-07-01-citadel-iso-pixel-art-quality-research.md#on-downloading-free-assets--reference-only-decided)).
So these are studied for **form / silhouette / value-structure / personality** and then
**hand-translated** to EDG32 recipes.

Downloaded packs land in `inspirations/downloads/` which is **git-ignored** — run
`node inspirations/fetch.mjs` to pull them locally (see that script for the exact URLs).
Only this credits file + the fetch manifest are tracked.

---

## What to study (mapped to our gaps)

Our current buildings "look similar and flat" because they share **one cottage/box FORM
family** re-palettes, a **single roof pitch**, and **thin, sparse silhouette variation**.
The references below are chosen specifically to break that.

| # | Source | License | Author | Study for |
|---|--------|---------|--------|-----------|
| 1 | [SLYNYRD Pixelblog 41 — Isometric Pixel Art](https://www.slynyrd.com/blog/2022/11/28/pixelblog-41-isometric-pixel-art) | Tutorial (study only, do not copy pixels) | Raymond Schlitter (SLYNYRD) | 2:1 cube construction, wireframe-cuboid layout, forms-first sculpting, committed-light value order. |
| 2 | [SLYNYRD Pixelblog 54 — Isometric Pixel Art (advanced)](https://www.slynyrd.com/blog/2025/1/23/pixelblog-54-isometric-pixel-art) | Tutorial | Raymond Schlitter (SLYNYRD) | The **shading workflow** (base → varying bevels → AA → subtle outline → **minor dithering between clusters**); hue-shifted ramps; how the SAME footprint gets **personality via silhouette props + roofline variation**. Closest technique match to our recipes. |
| 3 | [Pixel Parmesan — Fundamentals of Isometric Pixel Art](https://pixelparmesan.com/blog/fundamentals-of-isometric-pixel-art) | Tutorial | Patrick "Pixel Parmesan" | Readability at small sizes, the 26.565° line, why outlines are a per-edge tradeoff (pixel tangents). |
| 4 | [Screaming Brain Studios — Isometric Grids reference + Iso Town Pack](https://screamingbrainstudios.itch.io/iso-town-pack) | **CC0** | Screaming Brain Studios | A whole **coherent town** where each building reads distinctly — roofline silhouette variety, chimney/dormer/awning personality props, warm palette. Our closest genre reference. |
| 5 | [OpenGameArt — "CC0 Isometric" collection](https://opengameart.org/content/cc0-isometric) | **CC0** (per-asset, verify) | curated by n1ght4ngel19 (various authors) | Breadth of iso building silhouettes; how packs vary roof pitch / height / footprint to avoid a samey grid. |
| 6 | [Kenney — Isometric asset packs](https://kenney.nl/assets/category:2D?search=isometric) | **CC0** | Kenney | Clean, legible iso volumes; consistent light; a large building vocabulary to compare silhouettes against. |
| 7 | [The Book of Shaders — ch. 6/11/12/13](https://thebookofshaders.com) | Tutorial | Patricio Gonzalez Vivo & Jen Lowe | fBm / value-noise theory behind our terrain + cloud/haze overlay (continuous overlays over palette-snapped art, never a live sprite recolour). |

### The specific lessons we're mining (personality + depth)

- **Silhouette-first personality.** A building must read from its *black silhouette* alone
  (SLYNYRD 41/54). Our house/bakery/smith/healer share the cottage form → they only differ
  by palette + a small accent. The refs show how roof **pitch**, **ridge direction**,
  **height**, **chimney/dormer/porch** placement, and **footprint break-ups** make same-size
  buildings unmistakable.
- **Value structure fights "flat."** Flatness = too few value bands and no hue-shift. Refs
  use **3–4 hue-shifted bands per face** + a warm ridge kiss + **cluster dithering between
  bands** (our least-used, highest-leverage step — SLYNYRD 54).
- **Base-square, narrowing upward.** Iso volumes start from a full ground diamond and step
  IN as they rise (tapered towers, hipped roofs, overhanging eaves that then pull in to a
  ridge). This is exactly the isometry test the showcase brief calls for.
- **Lived-in props are personality.** Barrels, flower boxes, laundry, wood stacks, awnings,
  waterwheels — the refs read as *inhabited*, which is what our set is missing at a glance.

---

## Provenance / honesty note

`fetch.mjs` pins the source pages; the actual binaries are pulled locally and git-ignored,
so we never redistribute third-party art through this repo and never risk a mis-licensed
blob in history. Verify each asset's CC0 status on its own page before using it even as a
local reference. If a link rots, the study notes above still stand on their own.
