# sprite-gen as an art tool (research)

status: open. Researched 2026-11-20. A trial waits for the owner's go-ahead, see "For the owner".
created: 2026-11-20
context: the owner, 2026-11-20: "Can you do a research about https://github.com/aldegad/sprite-gen. It
might help with the asset work in the game-engine." Research only. This note comes from reading the
source. Nothing was installed or run, so every quality and cost figure below is sprite-gen's own.

## Verdict

One verb fits, `sprite-gen pixel-draw`. Claude writes the sprite as a keyed character grid in a fixed
palette. That is the shape of our `PixelRecipe`, so it can draft recipes without changing how art lives
in this repo. The rest of sprite-gen makes raster images with image and video models, chroma keys and
packed PNG atlases. Adopting any of that would reopen two locked decisions, that art is source code and
that every colour comes from the game's fixed palette ([decisions.md](../wiki/decisions.md), sections
Assets and Art / Palette).

Model-written pixel art is not new here. Coding agents already write recipes: 48 of the 97 commits that
touch recipe or template files carry a Claude co-author line. So the real question is narrower. Does
`pixel-draw`'s loop of a held palette, mechanical gates, several candidates and a vision pick draw better
recipes than an agent writing one straight into the repo? Only a trial answers that.

MateQuest's combat art would gain most. It is still placeholder rectangles, and it needs an atlas before
any tool can help.

## What sprite-gen is

- A Python CLI and an agent skill for Codex and Claude Code, Apache-2.0, at
  [github.com/aldegad/sprite-gen](https://github.com/aldegad/sprite-gen). The repository was created on
  2026-05-12 and is at version 4.3.0. On 2026-11-20 it had about 4,200 stars and 440 forks and took
  commits that day. It is about 64,000 lines of Python, its only runtime dependencies are Pillow and
  NumPy, and it needs Python 3.11 or later.
- It targets painted or high-resolution 2D game art. You give it one still of a character and it makes
  the other frames.
  - **A, atlas rows.** An image model (Codex, Grok or OpenAI) draws one row per state on a chroma
    background. sprite-gen keys the rows into transparent frames and packs a `sprite-sheet-alpha.png`
    with a `manifest.json`.
  - **B, video to loop.** Grok Imagine animates the still. ffmpeg, RIFE and sprite-gen's loop finder
    then cut the clip into a seamless transparent loop.
  - **C to E, tools.** Cutout and sheet slicing, palette-swap recolour, Aseprite JSON export for Phaser
    and Flame, repeating background tiles, projected shadows, motion inspection and scene composition.
  - **Smaller verbs.** `pixel-draw`, and `logo` for title lettering.
- Calls run on the user's own logins first, through the `codex`, `grok` and `claude` CLIs. It reads an
  API key only when no login is present.

## What this repo asks of art

- **Art is source.** A sprite is a `PixelRecipe`, an ASCII grid of palette characters
  ([types.ts](../../games/farm/atlas-recipes/src/types.ts)). Farm has about 240 recipe files, and
  [`tools/atlas-builder`](../../tools/atlas-builder/) bakes them into atlases.
- **One fixed palette per game, held by a guard test.** EDG32 for the engine and Farm, Apollo-46 for
  Citadel and Hollow, Resurrect 64 for MateQuest.
- **Not everything is a grid.** Citadel's buildings are iso painters written in code
  ([citadel-art-style.md](../wiki/citadel-art-style.md)), Hollow is vertex-coloured 3D, and Farm's
  farmer frames come from templates with substitution maps and guard tests.
- **MateQuest has placeholder art.** Its hero and six enemies are rectangles and triangles
  ([sprites.ts](../../games/mathquest/client/src/ui/sprites.ts)). Its design page plans to "commission
  pixel art via the atlas-recipe pipeline once the fun is confirmed"
  ([mathquest-overview.md](../wiki/mathquest-overview.md)).

## Each part against that bar

| Part | Fit | Why |
|---|---|---|
| `pixel-draw` | **Yes** | It writes a keyed grid in a palette we choose. Details below. |
| A, atlas rows | No | It paints raster frames and packs a PNG atlas. Its pixel-art mode, [pixel-unfake](https://github.com/aldegad/sprite-gen/blob/main/docs/pixel-unfake.md), quantises to a median-cut palette of N colours, not to a fixed palette. The recipe would stop being the source, and the palette guard would never see the colours. |
| B, video to loop | No | It needs xAI's Grok Imagine, ffmpeg and RIFE, and it makes painterly loops. Wrong style and wrong scale for 16 px sprites. |
| Recolour | Not needed | Farm already makes variants in code, with the personality substitution maps in [templates.ts](../../games/farm/atlas-recipes/src/templates.ts). |
| Aseprite export, manifest | Not needed | The atlas builder writes our own manifest. |
| Cutout, slice-sheet | Not today | They help only when importing third-party raster art, such as the CC0 packs Citadel used as references. |
| Background tile, shadow, scene | No | Raster tools for painted scenes. No game draws a painted image through [`@tool/image-patches`](../wiki/asset-pipeline.md) yet. |

## `pixel-draw` in detail

**How it works.** Claude Opus 5.5 writes `grid.txt` itself. It does not paint an image that gets shrunk
afterwards. The file is a `PALETTE` block of `<key> #RRGGBB` lines, with `.` for transparent, then
`FRAME <name>` and one row of keys per pixel row. Code then checks the answer.

1. A strict parser reads the grid. Broken rows go back to the model one at a time, and a broken answer
   gets one redraw.
2. Gates check the result. G2 allows only palette colours, G3 wants a transparent background, G5 flags
   stray single pixels, G6 wants frames of one height on one floor row, and G8 wants the body inside a
   safe area with the feet on the floor row.
3. A vision call picks the best of K candidates, or a person picks.

`grid.txt` is the run's record, and `pixel-draw --grid` checks and renders an edited grid with no model
call. Frames are square, 8 to 48 px. A motion holds up to 64 frames, drawn four at a time on one palette.

**Its own measurements.** About 250 drawings from 2026-10-12 to 14, judged by a vision model. Nobody
reproduced them here.

- At 32 px and below the drawings came out shippable. At 16 px, and on characters in general, they beat
  GPT images shrunk to size. 48 px held up in 7 of 8 and is the edge of what was measured.
- Walk cycles are drafts. The legs barely change sides between the two contact frames.
- A fixed palette (PICO-8) was always kept, "at a visible cost in material rendering". Nobody measured a
  fixed palette of 32 colours or more.
- On an API key, at effort high with two candidates and the pick, a sprite cost $0.39 and took about
  100 s, an icon $0.31, a tile $0.21 and a four-frame walk $0.96. On a Claude login a call costs nothing
  extra but counts against the plan's usage. `--batch` halves the price and needs an API key.

**How it runs.** It starts the `claude` binary in print mode with `--safe-mode`, which loads no tools,
hooks, skills or MCP servers, from an empty folder on the signed-in plan. A service that draws for other
people has to use an API key.

## What a bridge from `grid.txt` to a recipe needs

1. **A palette file per game.** A fixed palette holds at most 62 colours, one key each. EDG32 with 32
   and Apollo-46 with 46 fit. Resurrect 64 does not, so MateQuest would pass its 32 `MATE_PAL` role
   colours ([mate-palette.ts](../../games/mathquest/client/src/render/mate-palette.ts)), the only ones
   its code draws with anyway.
2. **A converter from hex to our characters.** It is not one to one. Farm's `SWATCH` gives several
   colours more than one character by role, for example `G` and `C`, `g` and `L`, `D` and `m`
   ([palette.ts](../../games/farm/atlas-recipes/src/palette.ts)). The converter writes one canonical
   character per colour, and whoever touches up the draft swaps in role characters where they matter.
3. **A crop for non-square recipes.** Drawings are square, so the 32×24 blackjack table would be drawn
   at 32×32 and cropped. `--grid` reads non-square grids.
4. **The reverse direction.** Writing an existing recipe out as `grid.txt` lets `pixel-draw --grid` run
   its stray-pixel, floor-row and safe-area gates on today's art with no model call. Nobody tried it,
   because auto mode refused the local install in the research session.

## Where it would help

1. **MateQuest's combat sprites.** Făt-Frumos and six folklore enemies (`dragon`, `balaur`, `strigoi`,
   `varcolac`, `capcaun`, `muma`) at 32 to 48 px. The blocker comes before any tool, because MateQuest
   has no sprite atlas.
   - It registers only the font atlas.
   - `tools/atlas-builder` is Farm-only. It imports `@farm/atlas-recipes` and writes into Farm's
     `public/atlas`.
   - The engine side is ready. `@engine/ui` has `UISurface.sprite(x, y, w, h, atlasId, frame)`.

   So MateQuest needs a recipe set, a builder that serves more than one game, and `sprites.ts` moved
   onto `surface.sprite`. That is a brief of its own, and it is needed whether `pixel-draw` or an agent
   writes the recipes.
2. **New Farm props, item icons and crops** at 16 to 32 px.
3. **Not a fit.** Farm's farmer frames come from templates, Citadel's buildings are iso code, Hollow is
   3D, and real animation loops are past what `pixel-draw` was measured on.

## Adopt or borrow

- **Adopt it as an outside tool.** It runs on the owner's machine, outside this repo, and only the
  converted recipe gets committed. No Python enters the repo and the recipe stays the source, so "no
  external art pipeline" still holds. It has two drawbacks. `pixel-draw` is marked experimental, and the
  project changes every day.
- **Borrow the gates.** Agents already write recipes, so the part worth copying may be the checks, not
  the drawing. A recipe test for stray pixels, the floor row and the safe area, beside the palette guard
  we already have, would catch what G5, G6 and G8 catch, on every recipe, with no model call. Drawing
  several candidates and picking one is a habit an agent can follow with no tool at all.
- **Recommendation.** Run the trial first. If `pixel-draw` clearly beats an agent writing the recipe
  directly, adopt it for drafts. If it doesn't, borrow the gates as tests. They are cheap and worth having
  either way.

## For the owner

- **The trial needs the owner's go-ahead.** Auto mode refused installing the cloned repo, and the
  drawings spend Claude plan usage.
- **The trial itself.** Draw the same two subjects both ways: with `pixel-draw` (two candidates and the
  pick, on the Claude login) and with a coding agent writing the recipe directly, as today. The subjects
  are one MateQuest enemy at 32 px in the `MATE_PAL` colours and one Farm item icon at 16 px in EDG32. By
  sprite-gen's own figures, each `pixel-draw` subject costs about $0.30 to $0.40 if paid by API key.
- **If `pixel-draw` wins.** MateQuest still needs the atlas brief above first.
