# Animation tags in the manifest

status: built as brief 22 on 2026-11-23 (forge fire moved; the other eight clips remain). Promoted ([22](../briefs/done/22-animations-declared-with-the-recipes.md)), by the owner's call to
build light optimizations without waiting for a trigger. Its trigger was to promote it with the first animated MateQuest sprite, or the next new Farm animation.
created: 2026-11-20
context: the 60 fps plan, [frame-budget.md](../wiki/frame-budget.md).

The atlas manifest lists frames and their rectangles. Which frames make up an animation, in which
order and for how long is written in code: `AnimationClip` in `@engine/core/animation`, and the frame
names in each game's render code ([animation.md](../wiki/animation.md)). Adding a frame to a walk
cycle means changing art and code together.

Aseprite's JSON export, which Phaser, Godot importers and most 2D engines read, puts this in the
data as frame tags with a range, a direction and a duration per frame. If it is promoted, a recipe
set declares its animations (name, frame list, duration per frame, loop or once), the cook writes
them into the manifest, and `AnimationClip` builds from the manifest. Code then names an animation,
not its frames.
