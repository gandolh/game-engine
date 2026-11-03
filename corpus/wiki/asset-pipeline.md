---
summary: The bake principle (assets are code, not images), asset-cooking and atlas research, the cache-key/incremental-build recommendations that became brief 71, the 2026-10-28 large-image research, and the static layer's patches as built 2026-11-03 (the 4096 px single-texture ceiling, lazy per-patch bakes, painted images, the dev page, the upside-down upload fix).
updated: 2026-11-03
---

# Asset Pipeline — Baking, Caching, and Atlas Strategy

Research synthesis (2026-06-10) on asset "cooking" and texture-atlas best practice, filtered against what this repo actually does. Fed [brief 71](../todos/closed/71-per-asset-recipe-files-and-cached-atlas-builds.md) (shipped 2026-06-10 — recommendations 1–4 landed; 5 was verified already true: [loader.ts](../../engine/core/src/assets/loader.ts) decodes each sheet via `createImageBitmap`).

## The bake principle (what we already do)

Assets are **code, not images**: each sprite is a `PixelRecipe` (ASCII pixel grid + EDG32 palette chars) in [games/farm/atlas-recipes/src/](../../games/farm/atlas-recipes/src/). `npm run atlas` rasterizes every recipe and shelf-packs them into 6 specialized sheets (`characters`, `buildings`, `terrain`, `crops`, `props`, `items-ui`) + an `index.json`, committed under [games/farm/client/public/atlas/](../../games/farm/client/public/atlas/) (brief 47). The renderer resolves frames per-sheet via `atlasId` — one GL texture per sheet in [`GlAtlasStore`](../../engine/core/src/render/webgl2/gl-atlas-store.ts) (`uv(atlasId, frame)` → UVs, `texture(atlasId)` → the handle), which is also the unit the sprite batch coalesces draw groups around. It additionally bakes the static backdrop + water pattern once at startup: the bake is still CPU `drawSprite` onto an offscreen 2D canvas, then uploaded as a texture ([`static-layer-pass.ts`](../../engine/core/src/render/webgl2/static-layer-pass.ts)).

This matches the industry "asset conditioning" pattern exactly — source asset → deterministic transform → optimized runtime artifact — as in Unreal cooking, Unity's import pipeline (`Library/` cache + `.meta` sidecars), Godot's `.import` sidecars + `.godot/imported/` cache, and O3DE's Asset Processor (SQLite job-fingerprint graph).

Gaps identified 2026-06-10 versus that pattern (**all closed by brief 71** — kept for the reasoning, not as a live TODO list):

1. **One monolithic source.** [atlas-recipes/src/assets/](../../games/farm/atlas-recipes/src/assets/) is ~4,300 lines of inline recipes — authoring/diffing one asset means scrolling a monolith.
2. **No incremental build.** The builder always re-rasterizes and re-writes all 6 sheets, even when nothing in a sheet changed.
3. **PNG bytes are not pinned.** `pngjs` `PNG.sync.write` is used with default options (`filterType: -1` = auto, default deflate). Output is content-dependent; pinning the encoder settings makes bytes a pure function of pixels, which both keeps committed-artifact diffs honest and makes output hashes usable as cache keys.

## Cooking techniques — what the literature says

**The canonical incremental-cook recipe** (Bazel, Turborepo, Nx, O3DE, AssetCooker all converge on it):

1. A *rule* maps source files → transform → declared outputs.
2. A *fingerprint* is the cache key: SHA-256 over **content** of all inputs (never mtimes — they lie after `git checkout`), plus tool/config version, plus a rule-version integer to force global rebuilds when the transform logic changes.
3. Cache lookup: fingerprint match → reuse output, skip the work.
4. A dependency graph propagates invalidation (shared input changed → all dependents dirty).

Concrete cache-key composition for our builder, per sheet:

| Input | Why it's in the key |
|---|---|
| Content hash of every recipe file feeding the sheet | the obvious one |
| Content hash of `palette.ts` (swatch map) | palette change recolors every sheet |
| Content hash of generator sources (`templates.ts`, `index.ts` composition logic) for sheets with generated frames | farmer poses are *procedural* assets; the generator is their source |
| Packing config (padding, pow2 policy) + a `BUILDER_VERSION` constant | algorithm/format changes must miss the cache |

Because our artifacts are **committed**, the natural cache store is the manifest itself: stamp each `<sheet>.json` with its `inputsHash`; on rebuild, recompute and skip the sheet on match. No separate cache file, works across clones, and `git diff` shows exactly which sheets a change touched.

**Determinism of the PNG step.** With `pngjs`, pin `filterType: 0` (None — fine for flat-color pixel art), `deflateLevel: 9`, `deflateStrategy: 3`: byte-identical output for identical RGBA across machines/runs. This is the same property we already demand of the sim (mulberry32, no `Date.now()`), applied to the asset cook.

## Atlas best practice — filtered for a pixel-art game

**How many sheets / what sizes.** Web-safe max texture is 4096² (99% of devices; only ~50% support more). Irrelevant at our scale: ~170 frames of 16×16 (a few 32px) ≈ 45k px² of content — everything fits in one 256² sheet. Our 6-sheet split is justified by **authoring ergonomics and git-diff locality** (regenerate just `crops` when a crop changes), not by GPU limits. Keep ~6; don't over-split (per-sheet decode + HTTP fetch overhead) and don't merge (kills the per-sheet cache win). Power-of-two dimensions (already done via `nextPow2`) remain the safe default.

**Packing algorithm.** Jylänki's survey ("A Thousand Ways to Pack the Bin", 2010) ranks MaxRects-BSSF best for occupancy (95–98% vs 85–92% for shelf/guillotine) — but the gap only matters for *mixed-size* inputs. Our frames are near-uniform 16×16, where shelf packing is already near-optimal, deterministic, and ~50 lines of in-repo code. **Verdict: keep shelf**; note [maxrects-packer](https://www.npmjs.com/package/maxrects-packer) (TypeScript, zero deps, `smart`/`pot`/`allowRotation:false` options) as the drop-in upgrade if multi-tile structures ever bloat a sheet. Never enable rotation for pixel art.

**Padding / bleeding.** Texture bleed is a *filtering* artifact: bilinear sampling at a frame edge mixes in the neighbor's texels. With nearest-neighbor (`imageSmoothingEnabled = false`, our default draw path) 1px transparent padding — what `packShelf` already does — is sufficient. Extrusion (duplicating edge pixels into the gutter) is the fix only where smoothing is intentionally enabled; brief 63's water-shimmer work is the local precedent that fractional-scale smoothing paths exist, so keep extrusion in the toolbox but don't apply it by default. No mipmaps for 2D pixel art (33% memory for blurrier output).

**Does atlasing matter?** It matters *more* than this page originally argued. The pre-2026-08-18 text
read "less than WebGL (no explicit draw-call batching to preserve)" — true of Canvas2D, and **inverted
by the WebGL2 migration**: [webgl2/renderer.ts](../../engine/core/src/render/webgl2/renderer.ts) keeps
one sprite group **per atlas texture**, so the sheet split now sets the frame's draw-call count directly
and a texture switch ends a batch. The "keep ~6 sheets" verdict above still holds (6 draw calls is
nothing), but the reason changed from ergonomics-only to ergonomics **plus** batching.

- First GPU upload of an image is the expensive step (~hundreds of ms observed for a first `texImage2D` vs ~0.1ms warm); one image per sheet = 6 uploads instead of ~170.
- Loading thousands of individual images measured 17× slower than one atlas in the classic Game Developer HTML5 benchmark; even bundled, fewer `Image` objects = less GC pressure.
- `createImageBitmap()` per sheet at load decodes off the main thread into a GPU-friendly bitmap (worth checking [loader.ts](../../engine/core/src/assets/loader.ts) does this).
- Drawing in sheet-grouped order within a frame helps GPU texture-cache locality — our painter's-sort by `y` makes strict grouping impractical; not worth fighting. Under WebGL2 this is what the per-atlas grouping already buys.

**Manifest format.** TexturePacker JSON-Hash (`frames` dict + `rotated`/`trimmed`/`sourceSize` flags) is the interop standard, but those flags only pay when trimming/rotating — we do neither. Our minimal `{id, imageUrl, width, height, frames:{name:{x,y,w,h}}}` is the right call; just add the `inputsHash` stamp.

**Build-process efficiency.** At our scale packing is microseconds; the costs are PNG encode + I/O. Per-sheet skip eliminates both for untouched sheets, keeps full-rebuild correctness, and (deliberately) avoids heavyweight machinery: no Turborepo/Nx layer, no AssetPack dependency — a content-hash check inside the existing ~170-line builder.

## Recommendations (encoded in brief 71)

1. Split `base-recipes.ts` into **one file per asset**, directory mirrors the frame namespace (`recipes/assets/tile/shore.ts` → `tile/shore`), aggregated by an explicit barrel; a test asserts path ↔ `name` agreement so files can't drift.
2. **Per-sheet incremental bake**: fingerprint each sheet's inputs (table above), stamp `inputsHash` into the manifest, skip unchanged sheets; `--force` flag for full rebuilds.
3. **Pin PNG encoder options** for byte-stable committed artifacts (one-time whole-atlas diff when this lands).
4. Keep shelf packing, 1px padding, pow2, 6 sheets; document maxrects-packer as the future upgrade path.
5. Load-time: verify/adopt `createImageBitmap` per sheet. *(Verified 2026-06-10: already the case in [loader.ts](../../engine/core/src/assets/loader.ts).)*

## Art direction (2026-06-10 art pass)

A designer pass over the recipes themselves (not the pipeline), guided by the classic pixel-art craft rules (Saultoons' "The ONLY Pixel Art Guide You Need" — readable silhouettes, hue-shifted ramps, selective outlines, texture clusters over speckle noise, one committed light direction). The rules now encoded in the assets, for anyone touching recipes later:

- **All 32 EDG32 colors are mapped.** [palette.ts](../../games/farm/atlas-recipes/src/palette.ts) previously used 20; the art pass added swatch chars for the missing 11 — deep foliage `t` #193c3e, cool-outline navy `N` #262b44, flame `f` #f77622, bright red `R` #e43b44, deep red `x` #a22633, grape `U` #b55088, deep purple `u` #68386c, petal pink `P` #f6757a, sparkle cyan `i` #2ce8f5, warm highlight `h` #e8b796, wicker `H` #c28569. Palette changes invalidate every sheet's `inputsHash` (by design).
- **Light comes from the top-left, everywhere.** Trees/bushes carry a 4-step hue-shifted ramp (`g→G→l→t` summer, `y→a→f→x` autumn) — shadows shift hue toward cool/deep, never just darker.
- **Tiles use texture clusters, not lone-pixel speckle.** Grass = 2px tufts with a light tip; autumn = 2px leaf pairs in drifts; dirt = clods; sand = ripple runs; winter = 2px `q` drift shadows. Keep marks in small clusters and off systematic rows so tiling doesn't seam.
- **Fire is a 4-step ramp** `y→o→f→r`; the overlay frames (campfire/forge a-b-c) keep their exact shapes/positions — only colors changed, so render-loop anchoring is untouched. Waterfall frames carry cyan `i` glints that step down one row per frame, matching the documented falling-streak behavior.
- **Crops read by hue**: grapes/radish purple `U/u/P`, tomato `R/x`, carrot `f/p`, pumpkin ribbed `f/p/r/x`, squash `h/W/H` — each mature crop has a glint and a shaded side.
- **Farmer sprites were deliberately left alone** — they're template-generated ([templates.ts](../../games/farm/atlas-recipes/src/templates.ts)) with personality substitution maps and hat-silhouette guard tests; restyling them is its own brief.

## Large images and patches (research 2026-10-28)

From [the tiled-textures research](../todos/closed/2026-10-27-tiled-textures-for-large-assets-research.md).
A **patch** is one fixed-size square of a large baked or drawn image, uploaded as its own texture
([glossary](glossary.md)). Target: desktop GPUs, worlds at least twice Farm's 240×240 at 16 px;
phones still run, every texture under 4096 px. Raw numbers:
[performance-measurements.md](performance-measurements.md) → *Large textures*.

**What each game uploads at boot** (uploaded texel bytes, measured with a WebGL wrapper):

| Game | Largest texture | Total live |
|---|---|---|
| Farm | static layer 3840×3840 (56.3 MB) | 12 textures, 61.4 MB (+ a viewport-sized overlay-light texture, re-uploaded often) |
| Citadel 192×192 | static layer 6144×3072 (72 MB) | 5 textures, 76.1 MB |
| Hollow | none: vertex-coloured 3D, DOM panels | 0 |
| MateQuest | font 936×8 | 2 textures |

**Breaking points** (`MAX_TEXTURE_SIZE` forced lower): at **4096 Citadel does not boot**. Its
192×192 world takes the windowed path, but the boot camera frames the whole map, so the first window
is the whole iso world: 6144 px wide. Farm boots at 4096 (3840 fits) and fails at 2048. Atlases are
256×4096 at most, so they are not the problem.

**Three designs compared** (Farm's 3840² bake unless stated):

| | One texture (today) | Citadel's window, in the engine | Patch grid |
|---|---|---|---|
| GPU memory | whole image | window + pad only | whole image if all kept; view + a ring if far patches are freed |
| Draw calls | 1 | 1 | visible patches: 1 to 4 at 2048 px, up to 16 at 1024 |
| Bake | once | again on every pan past the pad (one per frame) | once; uploads 3.2-3.8 ms for 4 patches, 37.8 ms for 64, vs 15.7 ms single (one or two runs each) |
| Over the limit | throws, naming the limit | throws when the window is wide (Citadel's boot) | fits by construction |
| Code | exists | ~380 lines in Citadel today | ~90 lines prototyped (`90434df`) |

**Iso**: a tile's diamond crossing a patch edge is not a problem when the bake is cut after it is
composed (the prototype), and not when each patch bakes its own iso region either: Citadel already
bakes diamonds into an arbitrary iso sub-region (`makeTerrainDecorate(iso, grid, window)`), which is
exactly a patch bake. Seams: none visible by eye with 512 px patches at a wheel-zoomed scale, and the
unit test shows neighbouring blits share edges exactly; not pixel-verified on a GPU.

**Tiled maps** (`.tmj`, the map editor): a JSON map of tile layers (GID arrays, optionally chunked),
object layers and tilesets. Loading one means a GID → atlas-frame table and a sprite list for the
static bake, which then goes through the same patches; it touches nothing else here. No game draws
its world (Farm and Citadel generate theirs from a seed), so no spec.

**Hand-drawn images**: a painted background is the same problem as a big bake. The patch grid serves
it unchanged if the image arrives already sliced: the asset step cuts the source (say 8192×8192) into
patch-sized files, the loader uploads each as a patch. That is part of the engine spec below.

**Recommendation**: move the static layer onto patches in the engine, sized from the device limit
(2048 px, or the limit if smaller), baked per region and lazily, far ones freed. It fixes Citadel's
boot today and lets Farm grow past 4096. Keep one texture when a bake fits. Follow-up specs, for the
owner: [Citadel boot bake over 4096](../todos/closed/2026-10-28-citadel-boot-bake-over-4096.md),
[patched static layer in the engine](../todos/closed/2026-10-28-engine-patched-static-layer.md), then
[Citadel's window onto patches](../todos/closed/2026-10-28-citadel-window-onto-patches.md).

## Patches as built (2026-11-03)

The [engine spec](../todos/closed/2026-10-28-engine-patched-static-layer.md) built the recommendation:
- **The rule:** a static layer up to 4096 px (`SINGLE_TEXTURE_MAX`) that the device allows stays one
  texture, so Farm's 3840 px bake is unchanged on desktop. A bigger layer, or one past the device's
  limit, is drawn as a grid of patches 2048 px a side (or the device limit, if smaller).
- **When patches are baked:** each patch bakes its own world rect the first time the view touches it.
  That bake covers the sprites whose box overlaps the patch and the decorator, which receives the patch's
  rect as `region`. One patch in the ring round the view is baked ahead per frame, and patches two rings out are freed.
- **The code:** the planning is pure and tested ([static-patches.ts](../../engine/core/src/render/static-patches.ts));
  the GL pass is [static-layer-pass.ts](../../engine/core/src/render/webgl2/static-layer-pass.ts).
  `renderer.staticLayerInfo()` reports the mode and the live patches.
- **Testing a smaller device:** `createRenderer`'s `textureLimit` makes the renderer behave as a
  device with that limit. Farm reads it from `?textureLimit=` in dev builds only.
- **Painted images:** `@tool/image-patches` cuts a PNG into 2048 px files plus a `patches.json`
  file. `loadPatchedImage` fetches each file the first time its patch is in view and closes it when the patch is freed.
  `renderer.bakeStaticImage` shows the result. No game uses this yet.
- **The dev page** (`npm run harness -w @tool/image-patches`, at `/harness/`) has two modes: a 480×480-tile
  world (7680 px, twice Farm's width) and the generated sample painted image. It exposes
  `window.__patchHarness()`.
- **Checked in headless Chromium:**
  - no texture over 2048 px while panning across the 7680 px world;
  - no gap pixels at four fractional zooms;
  - against a single texture, the same world on 1024 px patches matched at zoom 2.37. At 1.37 and 0.73,
    0.01-0.04% of pixels differed, all one-pixel tile markers away from patch edges: nearest sampling
    rounds differently against a smaller texture.
- **Upside-down fix:** the patch walk also showed that every baked static layer had been drawn upside down.
  The upload set `UNPACK_FLIP_Y_WEBGL`, which flips canvas sources and is ignored for ImageBitmaps,
  so the atlases were fine and the terrain was mirrored under them. The houses-in-water in the README's
  Farm image are this bug. See [decisions.md](decisions.md) → Renderer.

## Sources

- [Unreal — Cooking Content](https://dev.epicgames.com/documentation/en-us/unreal-engine/cooking-content-in-unreal-engine) · [Unity — SpriteAtlas](https://docs.unity3d.com/2020.1/Documentation/Manual/class-SpriteAtlas.html) · [Godot — Importing images](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/importing_images.html) · [O3DE asset pipeline](https://deepwiki.com/o3de/o3de/4-asset-pipeline) · [AssetCooker](https://github.com/jlaumon/AssetCooker)
- [Bazel remote caching](https://bazel.build/remote/caching) · [Turborepo caching](https://turborepo.dev/docs/crafting-your-repository/caching) · [Nx — how caching works](https://nx.dev/docs/concepts/how-caching-works)
- [Jylänki — A Thousand Ways to Pack the Bin (2010)](https://core.ac.uk/outputs/103387426/) · [maxrects-packer](https://github.com/soimy/maxrects-packer) · [free-tex-packer-core](https://github.com/odrick/free-tex-packer-core) · [TexturePacker texture settings](https://www.codeandweb.com/texturepacker/documentation/texture-settings)
- [WebGL Fundamentals — preventing texture bleeding](https://webglfundamentals.org/webgl/lessons/webgl-qna-how-to-prevent-texture-bleeding-with-a-texture-atlas.html) · [WebGL2 Fundamentals — cross-platform texture limits](https://webgl2fundamentals.org/webgl/lessons/webgl-cross-platform-issues.html) · [MDN — WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices) · [I Love Sprites — pixel-art padding](https://ilovesprites.com/blog/pixel-art-sprite-sheets-scale-padding)
- [Chrome — GPU acceleration in 2D canvas](https://developer.chrome.com/blog/taking-advantage-of-gpu-acceleration-in-the-2d-canvas) · [Game Developer — HTML5 atlases](https://www.gamedeveloper.com/programming/building-an-html5-game-don-t-shrug-off-atlases) · [MDN — createImageBitmap](https://developer.mozilla.org/en-US/docs/Web/API/CreateImageBitmap) · [MDN — optimizing canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas)
- [pngjs encoder options](https://github.com/pngjs/pngjs) · [PixiJS AssetPack](https://pixijs.com/blog/assetpack-1.0.0)
