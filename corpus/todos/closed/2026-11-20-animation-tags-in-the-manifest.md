# Animation tags in the manifest

status: built as brief 22 on 2026-11-23 ([22](../../briefs/done/22-animations-declared-with-the-recipes.md)), with the forge fire moved, and finished as brief 32 on 2026-11-26 ([32](../../briefs/done/32-farms-other-clips-declared-with-the-recipes.md)): the six whole-frame clips, the smoke wisps and the bird flap are declared too. The farmer walk and the action swing stay in code (the default of brief 32's owner question): they build frame names from a farmer's base, facing and pose at run time, which a declaration naming whole frames cannot hold. Promoted by the owner's call to build light optimizations without waiting for a trigger.
created: 2026-11-20
context: the 60 fps plan, [frame-budget.md](../../wiki/frame-budget.md).

The atlas manifest lists frames and their rectangles. Which frames make up an animation, in which
order and for how long is written in code: `AnimationClip` in `@engine/core/animation`, and the frame
names in each game's render code ([animation.md](../../wiki/animation.md)). Adding a frame to a walk
cycle means changing art and code together.

Aseprite's JSON export, which Phaser, Godot importers and most 2D engines read, puts this in the
data as frame tags with a range, a direction and a duration per frame. If it is promoted, a recipe
set declares its animations (name, frame list, duration per frame, loop or once), the cook writes
them into the manifest, and `AnimationClip` builds from the manifest. Code then names an animation,
not its frames.
