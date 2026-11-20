# sprite-gen as an art tool (research)

status: open: researched 2026-11-20; the owner decides whether model-drafted pixel art is wanted (see "For the owner")
created: 2026-11-20
context: the owner, 2026-11-20: "Can you do a research about https://github.com/aldegad/sprite-gen. It
might help with the asset work in the game-engine." Research only: the source was read, nothing was
installed or run, and every quality and cost figure below is sprite-gen's own measurement.

## Verdict

One verb fits: `sprite-gen pixel-draw`, where Claude writes a pixel sprite as a keyed character grid in
a fixed palette. That is the same shape as our `PixelRecipe`, so it can draft recipes without changing
how art lives in this repo. The rest of sprite-gen generates raster images (image and video models, chroma
keys, packed PNG atlases) and would reopen two locked decisions: art is source code, and every colour
comes from the game's fixed palette ([decisions.md](../wiki/decisions.md) → Assets, Art / Palette).

The place it would help most is MateQuest's combat art, which is still placeholder rectangles. That
needs engine work first, whichever tool draws the sprites (below).

## What sprite-gen is

- A Python CLI and an agent skill (Codex and Claude Code), Apache-2.0, at
  [github.com/aldegad/sprite-gen](https://github.com/aldegad/sprite-gen). The repository was created
  2026-05-12 and is at version 4.3.0. On 2026-11-20 it had about 4,200 stars and 440 forks and was
  pushed to that day. It is about 64,000 lines of Python, its only runtime dependencies are Pillow and
  NumPy, and it needs Python 3.11 or later. One maintainer writes most of it.
- It is aimed at painted or high-resolution 2D game art. You give it one still of a character and it
  makes the other frames:
  - **A, atlas rows:** an image model (Codex, Grok or OpenAI) draws one row per state on a chroma
    background. Those rows become transparent frames, then a `sprite-sheet-alpha.png` with a
    `manifest.json`.
  - **B, video to loop:** Grok Imagine animates the still. ffmpeg, RIFE and its loop finder cut the clip
    into a seamless transparent loop.
  - **C to E, tools:** cutout and sheet slicing, palette-swap recolour, Aseprite JSON export for Phaser
    and Flame, repeating background tiles, projected shadows, motion inspection and scene composition.
  - **Smaller verbs:** `pixel-draw`, and `logo` for title lettering.
- Calls run on the user's own logins first (the `codex`, `grok` and `claude` CLIs) and on an API key
  only when no login is present.

## What this repo asks of art

- **Art is source.** A sprite is a `PixelRecipe`, an ASCII grid of palette characters
  ([types.ts](../../games/farm/atlas-recipes/src/types.ts)). Farm has about 240 recipe files, and
  [`tools/atlas-builder`](../../tools/atlas-builder/) bakes them into atlases.
- **One fixed palette per game, enforced by a guard test:** EDG32 for the engine and Farm, Apollo-46
  for Citadel and Hollow, and Resurrect 64 for MateQuest.
- Citadel's buildings are iso painters written in code
  ([citadel-art-style.md](../wiki/citadel-art-style.md)), and Hollow is vertex-coloured 3D.
  Farm's farmer frames come from templates with substitution maps and guard tests.
- MateQuest's hero and six enemies are drawn from rectangles and triangles
  ([sprites.ts](../../games/mathquest/client/src/ui/sprites.ts)). Its design page plans to "commission
  pixel art via the atlas-recipe pipeline once the fun is confirmed"
  ([mathquest-overview.md](../wiki/mathquest-overview.md)).

## Each part against that bar

| Part | Fit | Why |
|---|---|---|
| `pixel-draw` | **Yes** | It writes a keyed grid in a palette we choose. Details below. |
| A, atlas rows | No | It paints raster frames and packs a PNG atlas. Its pixel-art mode ([pixel-unfake](https://github.com/aldegad/sprite-gen/blob/main/docs/pixel-unfake.md)) quantises to a median-cut palette of N colours, not to a fixed palette. A recipe would no longer be the source, and the palette guard would not see the colours. |
| B, video to loop | No | It needs xAI's Grok Imagine, ffmpeg and RIFE, and makes painterly loops. That is the wrong style and scale for 16 px sprites. |
| Recolour | Not needed | Farm already makes variants in code (the personality substitution maps in [templates.ts](../../games/farm/atlas-recipes/src/templates.ts)). |
| Aseprite export, manifest | Not needed | Our atlas manifest is our own and the builder writes it. |
| Cutout, slice-sheet | Not today | Useful only for importing third-party raster art, such as the CC0 packs Citadel used as references. |
| Background tile, shadow, scene | No | Raster tools for painted scenes. No game uses [`@tool/image-patches`](../wiki/asset-pipeline.md) for a painted image yet. |

## `pixel-draw` in detail

**How it works.** Claude Opus 5.5 writes `grid.txt` itself instead of painting an image that is then
shrunk: a `PALETTE` block of `<key> #RRGGBB` lines (`.` is transparent), then `FRAME <name>` and one row
of keys per pixel row. Code then checks the answer:

1. It parses the grid strictly. Broken rows go back to the model one at a time, and a broken answer is
   drawn once more.
2. Gates check the result: only palette colours (G2), a transparent background (G3), no stray single
   pixels (G5), frames of one height on one floor row (G6), and the body inside a safe area with the feet
   on the floor row (G8).
3. A vision call picks the best of K candidates, or a person picks.

`grid.txt` is the record of the run, and `pixel-draw --grid` checks and renders an edited grid with no
model call. Frames are square, 8 to 48 px, and up to 64 in a motion, drawn four at a time on one
palette.

**Its own measurements** (2026-10-12 to 14, about 250 drawings, judged by a vision model; not
reproduced here):
- **Quality by size:** 32 px and below came out shippable, and better than GPT images shrunk to 16 px,
  above all on characters. 48 px held up (7 of 8) and is the edge of what was measured.
- **Walk cycles are drafts:** the legs barely change sides between the two contact frames.
- **Fixed palettes:** a fixed palette (PICO-8) was always kept, "at a visible cost in material
  rendering". No 32-colour or larger fixed palette was measured.
- **Cost on an API key** (effort high, two candidates and the pick): a sprite cost $0.39 and took about
  100 s, an icon $0.31, a tile $0.21 and a four-frame walk $0.96. On a Claude login it costs nothing per
  call but counts against the plan's usage. `--batch`, at half price, needs an API key.

**How it runs.** It starts the `claude` binary in print mode with `--safe-mode` (no tools, hooks,
skills or MCP servers), from an empty folder, on the signed-in plan. A service drawing for other people
must use an API key.

## What a bridge from `grid.txt` to a recipe needs

1. **A palette file per game.** A fixed palette may hold at most 62 colours, one key each. EDG32 (32)
   and Apollo-46 (46) fit, but Resurrect 64 does not: 64 colours are refused. For MateQuest, pass the 32
   `MATE_PAL` role colours ([mate-palette.ts](../../games/mathquest/client/src/render/mate-palette.ts)),
   which are the only ones its code draws with anyway.
2. **A converter from hex to our characters.** It is not one to one: Farm's `SWATCH` gives one colour
   several characters by role (`G`/`C`, `g`/`L`, `D`/`m`, `w`/`T`, `l`/`c`, `o`/`a`, `p`/`A`, `W`/`b`,
   `s`/`Q`; [palette.ts](../../games/farm/atlas-recipes/src/palette.ts)). The converter writes one
   canonical character per colour, and a person changes role characters where it matters.
3. **A crop for non-square recipes.** Drawings are square, so a recipe such as the 32×24 blackjack table
   is drawn at 32×32 and cropped. `--grid` reads non-square grids.
4. **The other direction is cheap too.** Writing an existing recipe out as `grid.txt` lets
   `pixel-draw --grid` run its stray-pixel, floor-row and safe-area gates on our current art, with no
   model call. This was not tried: the local install was blocked in the research session.

## Where it would help

1. **MateQuest's combat sprites**, the largest gap: Făt-Frumos and six folklore enemies (`dragon`,
   `balaur`, `strigoi`, `varcolac`, `capcaun`, `muma`) at 32 to 48 px. The blocker comes before any tool:
   MateQuest has no sprite atlas.
   - It registers only the font atlas.
   - `tools/atlas-builder` is Farm-only: it imports `@farm/atlas-recipes` and writes into Farm's
     `public/atlas`.
   - The engine side is ready: `UISurface.sprite(x, y, w, h, atlasId, frame)` exists in `@engine/ui`.

   So this needs a MateQuest recipe set, a builder that serves more than one game, and `sprites.ts`
   moved to `surface.sprite`. That is a brief of its own.
2. **New Farm props, item icons and crops** at 16 to 32 px, as drafts a person touches up in the recipe.
3. **Not a fit:** Farm's farmer frames (templates), Citadel's buildings (iso code), Hollow (3D) and
   real animation loops.

## Adopt or borrow

- **Adopt it as an outside tool.** It runs on the owner's machine outside this repo, and the converted
  recipe is what gets committed. No Python enters the repo, and the recipe stays the source, so
  "no external art pipeline" holds in letter. Against it: `pixel-draw` is marked experimental, and the
  project ships changes every day.
- **Borrow the method.** A small script in `tools/` would ask Claude for a recipe in our palette
  characters directly and run our own checks: the palette guard, plus a floor-row and stray-pixel check.
  Nothing outside the repo is involved, but it has to be built.
- **Recommendation:** adopt for one trial before building anything. Borrow only if drafts become a
  regular part of the art work.

## For the owner

- **Taste call:** is model-drafted pixel art acceptable in these games, committed as recipes a person
  has touched up? Committing generated drafts is a new practice here. The question is also open in
  [open-questions.md](../wiki/open-questions.md).
- **Proposed trial:**
  - One MateQuest enemy at 32 px in the `MATE_PAL` colours, and one Farm item icon at 16 px in EDG32.
  - Two candidates each, on the Claude login.
  - By sprite-gen's own figures, about $0.30 to $0.40 each if paid by API key.
  - Judge the drafts against today's rectangle art and Farm's hand-made icons.
- **If the answer is yes:** MateQuest needs the atlas brief above first, whichever tool draws.
