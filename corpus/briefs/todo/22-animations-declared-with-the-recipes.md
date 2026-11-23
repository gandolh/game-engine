# Task 22: animations declared with the recipes

**Origin:** the [animation tags todo](../../todos/2026-11-20-animation-tags-in-the-manifest.md), promoted by
the owner on 2026-11-23 with the rest of the measure-first todos: build light optimizations that are not too
heavy, complex or wide ([decisions.md](../../wiki/decisions.md) → Frame budget). The plan is
[frame-budget.md](../../wiki/frame-budget.md).

**Builder:** Sonnet ([routing.md](../../routing.md)).

**Depends on:** none.

## Context

The atlas manifest lists frames and their rectangles. Which frames make an animation, in what order and for
how long is written in code: `AnimationClip` in `engine/core/src/animation/clip.ts`, built in Farm by
`loopClip(name, frames, periodMs)` (`games/farm/sim-core/src/render-systems/cycle.ts`). Nine clips are built
that way, in `clips.ts` and `frames.ts` beside it: foam, forge fire, forge smoke, the waterfall, the
fishing spot, the farmer's walk and others. Adding a frame to a cycle means changing the art and the code
together.

Aseprite's JSON export, which Phaser, Godot importers and most 2D engines read, keeps this in the data as
frame tags with a range, a direction and a duration per frame. This brief does the same for this repo's
recipes, and moves **one** clip to prove it. Moving the other eight is a follow-up, not this brief.

## Files you OWN

- `tools/atlas-builder/src/` (the cook's config type, the cook and its tests)
- `engine/core/src/animation/` (a way to build a clip from a declaration, and its test)
- `games/farm/atlas-recipes/`, for the declaration type's first use
- `games/farm/sim-core/src/render-systems/clips.ts`, for the one clip moved
- `corpus/` pages for this brief: the outcome, `log.md`, the todo's status line,
  [animation.md](../../wiki/animation.md) and [atlas-cook.md](../../wiki/atlas-cook.md)

## Files you must NOT touch

- The other eight clips, and MateQuest's recipes.
- The cooked sheets' pixels: frame rectangles and page layout stay byte-identical.

## What to do

1. **A declaration type.** A recipe set may declare animations: a name, an ordered list of frame names, a
   duration per frame (or one duration for all), and loop or once.
2. **The cook checks and writes them.** It refuses an animation naming a frame the set doesn't have, and
   writes the animations into the manifest beside `frames`.
3. **A clip from a declaration.** Add a function in `engine/core/src/animation/` that builds an
   `AnimationClip` from a declaration, so code names an animation, not its frames.
4. **Move the forge fire clip.** Declare it in Farm's recipe set and build `FORGE_FIRE_CLIP` from the
   declaration. Check the layering test first: if `@farm/sim-core` may not import `@farm/atlas-recipes`,
   put the declaration where both can read it and say why in the outcome.

## Acceptance

- The cook's test refuses an animation with an unknown frame name, and a manifest carries the declared
  animations.
- A test shows the forge fire clip built from its declaration samples the same frame as the old clip at
  every 10 ms over two loops.
- `npm run atlas` leaves every cooked PNG unchanged (compare hashes), and the manifests change only by the
  new `animations` field.
- `npm run check` exits 0, `npm run sim` prints the same results as before, and `bash corpus/lint.sh`
  passes.

## Owner steps

- Deploy Farm from the vps-deploy checkout: `node cli.ts farm-valley deploy`.
