---
summary: Citadel's cozy-medieval-storybook iso pixel-art style bible — EDG32 palette roles, shading/form/light rules, the layered-composite authoring path, and the per-recipe checklist.
updated: 2026-07-02
---

# Citadel — Cozy Iso Art Style Bible

The durable art-direction reference for Citadel's isometric pixel art. Style = **cozy
medieval storybook** (locked 2026-07-01). Every recipe/atmosphere decision serves this,
and everything stays inside **EDG32** ([palette.ts](../../engine/core/src/render/palette.ts))
and stays deterministic (no `Math.random`/`Date.now` in recipes; render-clock only for
animation). This page is the *what/why*; the phased work that applies it lives in the
[art briefs](../todos/) and the [research survey](../todos/closed/2026-07-01-citadel-iso-pixel-art-quality-research.md).

## The feel

Warm, inviting, lived-in. Golden-hour light, soft shadows, friendly rounded forms, lively
color, lamplit nights. **Charm over grit.** Matches the [cozy pivot](../todos/2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md).

## Foundations (already true in the renderer — don't break)

- **2:1 dimetric**, tiles 32×16, projection + `x+y` painter's depth in
  [iso.ts](../../games/citadel/client/src/render/iso.ts). Never change projection/depth math.
- **Committed sun, upper-left** → left face lit, right face shaded, dark outline.
- **Baked ground contact shadows** anchor every building + unit (keep them soft/feathered).
- **Assets are code**: ASCII `PixelRecipe` grids → one procedural atlas at boot. No PNGs.
- **Authoring resolution `ISO_ART_SCALE = 2`** (2× native; 4× a future knob). A single
  global constant — the recipe grid is hi-res, the GPU samples it into the same world quad,
  so detail scales without any layout change.

## Palette bias (EDG32 roles)

**Lead warm** — these carry the dominant read (roofs, plaster, timber, thatch):
`clay` #d77643 · `rust` #be4a2f · `tan` #e4a672 · `cream` #ead4aa · `wood` #b86f50 ·
`gold` #feae34 · `salmon` #f6757a · `yellow` #fee761 (accents/glow).

**Cool = shadow & depth only** (never the dominant read): `slate` #5a6988 ·
`navy` #3a4466 · `ink` #262b44 · `teal` #193c3e.

**Greens = life** (foliage, fields, garden props): `green` · `greenMid` · `greenDark`.

**Outlines**: prefer `bark` #3e2731 / `ink` on warm materials for soft edges; reserve pure
`black` #181425 for the thinnest silhouette lines only. Cozy = soft edges.

## Shading rules

- **3+ value bands per surface**, **hue-shifted** — shadows shift *cooler/deeper* (clay→rust→bark;
  stone→slate→navy), highlights *warmer* (a `salmon`/`gold` kiss on ridges + the near corner).
  Never "same hue, just darker," never collapse a shadow to black.
- **Cluster dithering** (1px, sparse checker on `(x+y)&1`) between value bands to round faces —
  subtle, cozy, never heavy crosshatch. Clusters over lone-pixel speckle.
- **Selective outline** on silhouette edges; **no outline where tiles abut** (avoids "pixel
  tangents" on autotiled roads/walls).
- **Soft contact shadow**, feathered SE (opposite the sun); at 2× add a feather ring so it
  stays soft at the higher density.

## Form rules

- **Friendly, rounded, plump** silhouettes: fat chimneys, rounded thatch, gentle overhangs.
  Soft bevels over brutal verticals.
- **Silhouette-first**: recognisable in solid black before interior detail. Silhouette (not
  just colour) distinguishes a mill from a mine from a chapel.
- **Lived-in props**: barrels, sacks, hay, wood stacks, flower boxes, laundry — a cozy town
  is inhabited, not sterile.
- **Warm window glow** at dusk (`gold`/`yellow` glass tied to the night factor) — the single
  strongest cozy cue at a glance.

## Light & atmosphere

- **Day/night wash** warm-biased at dawn/dusk (golden hour), *gentle* cool at night — never a
  hard blue-black; cozy nights are lamplit. Rendered via TintPass in
  [atmosphere.ts](../../games/citadel/client/src/render/atmosphere.ts).
- **Light pools** = warm lamplit glows at dusk (sprite quads; no native channel).
- **fBm fog/haze + soft vignette** as a reusable full-screen overlay (a `@engine/core` GPU
  pass) — low-contrast atmospheric drift, tick-driven/deterministic. Shaders are for
  *continuous overlays over palette-snapped art*, never for recolouring the discrete pixels.

## Authoring: layered composites (art-12, 2026-07-02)

A building recipe can be **hand-composed** (the classic FORM builders — `cottage`,
`fort`, `warehouse` — call a fixed `drawWalls` + roof + accent chain) **or assembled
from reusable `Layer` modules** via `composite(...)`. Both bake to ONE atlas frame with
identical footprint/height/name — the renderer and every caller are untouched, so
layering is **purely a boot-time authoring convenience with zero runtime cost**. All in
[iso-draw.ts](../../games/citadel/client/src/render/sprites/recipes/iso-draw.ts).

- **`Layer = (g, m, pal) => void`** — one painter pass onto the shared `IsoGrid`.
- **`composite(name, w, h, heightTiles, pal, layers)`** — stamps the contact shadow
  (via `begin`) then paints the layers back-to-front (later overpaints earlier,
  transparency-aware), returning the finished single-frame recipe. `boxBuilding` +
  `warehouse` are built this way.
- **Structural layers**: `wallsLayer`, `gableRoofLayer(overhang, riseMul)`,
  `hippedRoofLayer`, `doorLayer`, `accentLayer(fn)` (adapts a legacy `(g, pal, m)`
  accent into layer order).
- **Reusable detail modules** (drop onto ANY wall/roof-bearing base): `shutteredWindow(glow)`
  (leaded pane + sill + hinged shutters), `stoneCoursing` (ashlar courses + quoin
  cornerstones), `chimneyStack(glow)`, `groundApron(seed)` (dirt patch + barrels/props).
  These raise **effective resolution by concentrating detail where it reads** — the
  "higher res without a global `ISO_ART_SCALE` bump" win (the atlas is at its 256×4096
  pow2 ceiling, so per-piece local density adds detail at zero atlas cost).

Prefer `composite` for new building forms; migrating the remaining hand-composed forms
(cottage/fort/church) onto it is a natural next slice.

## Per-recipe checklist

- [ ] Silhouette reads in solid black.
- [ ] Upper-left sun; lit face warm, shadow face cool-not-black.
- [ ] 3+ hue-shifted value bands per surface.
- [ ] Selective outline (none at tile abutments).
- [ ] Subtle 1px cluster dithering between bands.
- [ ] Soft feathered contact shadow; reads anchored.
- [ ] Even dimensions; details on 2px boundaries.
- [ ] New building form? Reach for `composite([...Layer])` + the shared detail modules
      before hand-drawing (reuse over a bespoke chain).
- [ ] Cozy cues: lived-in props, warm dusk window glow, plants.
- [ ] Deterministic (render-clock only for animation).
- [ ] Palette guard green · typecheck green · **verified in a real browser** (playtest-citadel),
      not just unit tests.

## References (study for form/shading; do NOT commit external PNGs)

External art can't enter the build (palette guard + "assets are code"). Study, hand-translate
to EDG32. [SLYNYRD Pixelblog 41](https://www.slynyrd.com/blog/2022/11/28/pixelblog-41-isometric-pixel-art)
& [54](https://www.slynyrd.com/blog/2025/1/23/pixelblog-54-isometric-pixel-art) (closest technique
match) · [Pixel Parmesan fundamentals](https://pixelparmesan.com/blog/fundamentals-of-isometric-pixel-art) ·
[Screaming Brain Iso Town Pack (CC0)](https://screamingbrainstudios.itch.io/iso-town-pack) ·
[OpenGameArt CC0 Isometric](https://opengameart.org/content/cc0-isometric) ·
[The Book of Shaders](https://thebookofshaders.com) (ch. 6/11/12/13).
