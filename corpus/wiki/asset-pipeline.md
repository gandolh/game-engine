# Asset Pipeline — Baking, Caching, and Atlas Strategy

Research synthesis (2026-06-10) on asset "cooking" and texture-atlas best practice, filtered against what this repo actually does. Fed [brief 71](../briefs/game/done/71-per-asset-recipe-files-and-cached-atlas-builds.md) (shipped 2026-06-10 — recommendations 1–4 landed; 5 was verified already true: [loader.ts](../../packages/engine/src/assets/loader.ts) decodes each sheet via `createImageBitmap`).

## The bake principle (what we already do)

Assets are **code, not images**: each sprite is a `PixelRecipe` (ASCII pixel grid + EDG32 palette chars) in [tools/atlas-builder/src/recipes/](../../tools/atlas-builder/src/recipes/). `npm run atlas` rasterizes every recipe and shelf-packs them into 6 specialized sheets (`characters`, `buildings`, `terrain`, `crops`, `props`, `items-ui`) + an `index.json`, committed under [packages/farm-valley/public/atlas/](../../packages/farm-valley/public/atlas/) (brief 47). The renderer ([canvas2d](../../packages/engine/src/render/canvas2d/)) resolves frames per-sheet via `atlasId` and additionally bakes the static backdrop + water pattern to OffscreenCanvas once at startup.

This matches the industry "asset conditioning" pattern exactly — source asset → deterministic transform → optimized runtime artifact — as in Unreal cooking, Unity's import pipeline (`Library/` cache + `.meta` sidecars), Godot's `.import` sidecars + `.godot/imported/` cache, and O3DE's Asset Processor (SQLite job-fingerprint graph).

Current gaps versus that pattern:

1. **One monolithic source.** [base-recipes.ts](../../tools/atlas-builder/src/recipes/base-recipes.ts) is ~4,300 lines of inline recipes — authoring/diffing one asset means scrolling a monolith.
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

## Atlas best practice — filtered for a Canvas2D pixel-art game

**How many sheets / what sizes.** Web-safe max texture is 4096² (99% of devices; only ~50% support more). Irrelevant at our scale: ~170 frames of 16×16 (a few 32px) ≈ 45k px² of content — everything fits in one 256² sheet. Our 6-sheet split is justified by **authoring ergonomics and git-diff locality** (regenerate just `crops` when a crop changes), not by GPU limits. Keep ~6; don't over-split (per-sheet decode + HTTP fetch overhead) and don't merge (kills the per-sheet cache win). Power-of-two dimensions (already done via `nextPow2`) remain the safe default.

**Packing algorithm.** Jylänki's survey ("A Thousand Ways to Pack the Bin", 2010) ranks MaxRects-BSSF best for occupancy (95–98% vs 85–92% for shelf/guillotine) — but the gap only matters for *mixed-size* inputs. Our frames are near-uniform 16×16, where shelf packing is already near-optimal, deterministic, and ~50 lines of in-repo code. **Verdict: keep shelf**; note [maxrects-packer](https://www.npmjs.com/package/maxrects-packer) (TypeScript, zero deps, `smart`/`pot`/`allowRotation:false` options) as the drop-in upgrade if multi-tile structures ever bloat a sheet. Never enable rotation for pixel art.

**Padding / bleeding.** Texture bleed is a *filtering* artifact: bilinear sampling at a frame edge mixes in the neighbor's texels. With nearest-neighbor (`imageSmoothingEnabled = false`, our default draw path) 1px transparent padding — what `packShelf` already does — is sufficient. Extrusion (duplicating edge pixels into the gutter) is the fix only where smoothing is intentionally enabled; brief 63's water-shimmer work is the local precedent that fractional-scale smoothing paths exist, so keep extrusion in the toolbox but don't apply it by default. No mipmaps for 2D pixel art (33% memory for blurrier output).

**Does atlasing matter on Canvas2D at all?** Less than WebGL (no explicit draw-call batching to preserve), but yes:

- First GPU upload of an image is the expensive step (~hundreds of ms observed for a first `texImage2D` vs ~0.1ms warm); one image per sheet = 6 uploads instead of ~170.
- Loading thousands of individual images measured 17× slower than one atlas in the classic Game Developer HTML5 benchmark; even bundled, fewer `Image` objects = less GC pressure.
- `createImageBitmap()` per sheet at load decodes off the main thread into a GPU-friendly bitmap — the correct Canvas2D load pattern (worth checking [loader.ts](../../packages/engine/src/assets/loader.ts) does this).
- Drawing in sheet-grouped order within a frame helps GPU texture-cache locality — our painter's-sort by `y` makes strict grouping impractical; not worth fighting.

**Manifest format.** TexturePacker JSON-Hash (`frames` dict + `rotated`/`trimmed`/`sourceSize` flags) is the interop standard, but those flags only pay when trimming/rotating — we do neither. Our minimal `{id, imageUrl, width, height, frames:{name:{x,y,w,h}}}` is the right call; just add the `inputsHash` stamp.

**Build-process efficiency.** At our scale packing is microseconds; the costs are PNG encode + I/O. Per-sheet skip eliminates both for untouched sheets, keeps full-rebuild correctness, and (deliberately) avoids heavyweight machinery: no Turborepo/Nx layer, no AssetPack dependency — a content-hash check inside the existing ~170-line builder.

## Recommendations (encoded in brief 71)

1. Split `base-recipes.ts` into **one file per asset**, directory mirrors the frame namespace (`recipes/assets/tile/shore.ts` → `tile/shore`), aggregated by an explicit barrel; a test asserts path ↔ `name` agreement so files can't drift.
2. **Per-sheet incremental bake**: fingerprint each sheet's inputs (table above), stamp `inputsHash` into the manifest, skip unchanged sheets; `--force` flag for full rebuilds.
3. **Pin PNG encoder options** for byte-stable committed artifacts (one-time whole-atlas diff when this lands).
4. Keep shelf packing, 1px padding, pow2, 6 sheets; document maxrects-packer as the future upgrade path.
5. Load-time: verify/adopt `createImageBitmap` per sheet. *(Verified 2026-06-10: already the case in [loader.ts](../../packages/engine/src/assets/loader.ts).)*

## Sources

- [Unreal — Cooking Content](https://dev.epicgames.com/documentation/en-us/unreal-engine/cooking-content-in-unreal-engine) · [Unity — SpriteAtlas](https://docs.unity3d.com/2020.1/Documentation/Manual/class-SpriteAtlas.html) · [Godot — Importing images](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/importing_images.html) · [O3DE asset pipeline](https://deepwiki.com/o3de/o3de/4-asset-pipeline) · [AssetCooker](https://github.com/jlaumon/AssetCooker)
- [Bazel remote caching](https://bazel.build/remote/caching) · [Turborepo caching](https://turborepo.dev/docs/crafting-your-repository/caching) · [Nx — how caching works](https://nx.dev/docs/concepts/how-caching-works)
- [Jylänki — A Thousand Ways to Pack the Bin (2010)](https://core.ac.uk/outputs/103387426/) · [maxrects-packer](https://github.com/soimy/maxrects-packer) · [free-tex-packer-core](https://github.com/odrick/free-tex-packer-core) · [TexturePacker texture settings](https://www.codeandweb.com/texturepacker/documentation/texture-settings)
- [WebGL Fundamentals — preventing texture bleeding](https://webglfundamentals.org/webgl/lessons/webgl-qna-how-to-prevent-texture-bleeding-with-a-texture-atlas.html) · [WebGL2 Fundamentals — cross-platform texture limits](https://webgl2fundamentals.org/webgl/lessons/webgl-cross-platform-issues.html) · [MDN — WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices) · [I Love Sprites — pixel-art padding](https://ilovesprites.com/blog/pixel-art-sprite-sheets-scale-padding)
- [Chrome — GPU acceleration in 2D canvas](https://developer.chrome.com/blog/taking-advantage-of-gpu-acceleration-in-the-2d-canvas) · [Game Developer — HTML5 atlases](https://www.gamedeveloper.com/programming/building-an-html5-game-don-t-shrug-off-atlases) · [MDN — createImageBitmap](https://developer.mozilla.org/en-US/docs/Web/API/CreateImageBitmap) · [MDN — optimizing canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas)
- [pngjs encoder options](https://github.com/pngjs/pngjs) · [PixiJS AssetPack](https://pixijs.com/blog/assetpack-1.0.0)
