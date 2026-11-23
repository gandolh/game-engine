---
summary: What the Super Mario 64 decompilation (n64decomp/sm64 at 9921382) does with objects, collision, the camera, the frame and animation, set against this engine idea by idea with a verdict each (borrow, already have, not for us); four ideas became briefs 24-27.
updated: 2026-11-23
---

# Research: the Super Mario 64 decompilation

Source: [n64decomp/sm64](https://github.com/n64decomp/sm64) at commit `9921382`, read on 2026-11-23 against
this repo's code. Upstream files are cited as `path@9921382` and are evidence only.

**Licence.** The upstream repo is decompiled Nintendo code, whatever its licence file says. This page and
the briefs it produced take techniques and ideas only. No code, data, level layout, asset, name or character
comes into this repo, and no brief recreates any part of that game.

## Verdict

Most of what the decompilation does well, this engine already does, often more safely: ids that never
repeat, iteration that survives a despawn, frame-rate-independent camera smoothing, named random forks.
Four ideas are worth building, all small. Build static data once and only redo what changes (briefs 24 and
25). Let the engine, not each system, keep a state's entry tick (brief 26). Drive a walk cycle by the
ground covered, not by the clock (brief 27). The rest is console-era memory management or authored-level
machinery that procedurally generated, deterministic sims don't need.

## Objects

- **A fixed pool of 240 object slots.** SM64 builds every slot into a free list at load. When the pool is
  full it evicts an object from its "unimportant" list, or hangs if there is none
  (`src/game/spawn_object.c@9921382`, `src/game/object_list_processor.h@9921382`). Our
  [`World.spawn`](../../engine/core/src/ecs/world.ts) hands out monotonic ids from `nextId++` and keeps
  entities in an unbounded `Set`. **Not for us.** Slot reuse is how SM64 gets stale references: its own
  comment in `update_objects` (`src/game/object_list_processor.c@9921382`) warns that platform
  displacement can hit a different object that took a freed slot. Our ids never repeat. The render-side
  pools that need a cap already have one (particles 512, rain 900).
  One gap, not briefed: an explicit `id` passed to `spawn` doesn't advance `nextId`, so a later automatic id
  could repeat it (no game spawns with an explicit id as of 2026-11-23). There is no id lookup either; Farm's
  `findById` scans and copies a query on each call. A `world.get(id)` map would fix both.
- **Fixed processing order.** One table fixes the order of the object lists, and within a list objects run
  in insertion order (`sObjectListUpdateOrder`, `update_objects`). Our
  [scheduler](../../engine/core/src/sim/scheduler.ts) runs systems in registration order inside named
  stages, and a query iterates its `entities` array in insertion order. **Already have.** But no test pins
  query order, though every sim's determinism leans on it. Brief 25 added those tests (2026-11-23).
- **Deferred unload.** Deleting an object only clears its active flag. One sweep near the end of the frame
  unloads every flagged object (`unload_deactivated_objects`). Our `despawn` is immediate, and query
  iteration walks a pooled copy, so a despawn mid-loop is safe. **Already have the part that matters.**
  Citadel's and Hollow's "release before despawn" code
  ([sim-state.ts](../../games/citadel/sim-core/src/sim-state.ts), where a dead workplace must not leave a
  ghost worker) fixes references. End-of-tick removal would not replace it.
- **Action, sub-action and timer, kept by the engine.** On every update, if an object's action differs from
  last update's, the engine zeroes its timer and sub-action. Behaviour code never resets a timer by hand
  (`src/engine/behavior_script.c@9921382`, `cur_obj_update`). Ours: `FsmState.enteredTick` in
  [components.ts](../../engine/core/src/ecs/components.ts). It is set at spawn and never again: fifteen
  sites assign `fsm.current` directly, among them
  [deliberate-system.ts](../../engine/core/src/agent/deliberate-system.ts), and nothing reads the field.
  So it is wrong after the first transition. **Borrow: brief 26.**
- **Draw distance and time stop.** An object farther than its drawing distance is hidden and flagged as
  far away. A time-stop state updates only a chosen few lists (`cur_obj_update`,
  `update_objects_during_time_stop`). **Not for us in the sim.** Skipping updates by distance would change
  results, and the sims are small. On the render side, brief 19 culls Hollow's instances.
- **Respawn info.** When an object dies, a "don't respawn" bit goes into its static spawn record, so a
  reloaded area skips it (`unload_deactivated_objects_in_list`). **Not for us.** Our worlds come from a
  seed and are never reloaded mid-run. Revisit if Farm ever reloads a world with harvested tile features.
- **Collision by list pairs.** The player is tested against chosen lists, then a few list pairs, in fixed
  order (`src/game/object_collision.c@9921382`, `detect_object_collisions`).
  [`separateCircles`](../../engine/core/src/collision/separate.ts) sorts bodies by id over a spatial hash
  and resolves each pair once. **Already have**, and ours does not depend on caller order.

## Collision and movement

- **Static and dynamic surfaces.** Level triangles go into a cell partition once, at area load
  (`src/engine/surface_load.c@9921382`, `load_area_terrain`). Each frame, `clear_dynamic_surfaces`
  resets the surface pool to the static high-water mark and refills only the moving objects' surfaces. A
  floor query reads one cell (`src/engine/surface_collision.c@9921382`, `find_floor`). Ours: Farm's
  [FeatureCollisionSystem](../../games/farm/sim-core/src/systems/world-time/feature-collision.ts) reverts
  and re-stamps every tile feature and solid into the walkable grid on every tick.
  [PlayerControlSystem](../../games/farm/sim-core/src/systems/player-control/system.ts)'s `featureAt`
  scans every tile feature and solid for each tile Pip's box touches. **Borrow: brief 25, done 2026-11-23.**
- **Quarter steps.** A ground or air step is split into four sub-steps, each with its own wall, floor and
  ceiling queries, so speed cannot carry the player through a wall (`src/game/mario_step.c@9921382`,
  `perform_ground_step`). Ours: Pip moves a third of a tile a tick (`PLAYER_SPEED`). `resolveAxis` checks
  every tile a 0.6-tile box overlaps. Farm agents follow grid paths, and Hollow's agents step one tile a
  tick. **Not for us yet.** Nothing can tunnel as of 2026-11-23. Add sub-steps if a mover ever passes about 0.6 tile a
  tick.
- **Wall push-out.** Walls within a radius push the mover out along their normal, so motion along the wall
  survives (`find_wall_collisions`). Ours: `resolveAxis` resolves x, then y, and zeroes only the blocked
  axis, so Pip slides. **Already have.** A radius push-out would not suit a tile world.
- **No floor.** Out of bounds, `find_floor` returns a sentinel and no surface, and the step stops. Ours:
  `canStand` asks `isWalkable` and the feature check, and aboard a boat only the lane and dock tiles.
  **Already have.**
- **Platform displacement.** A rider is moved by its platform's own movement this frame, and rotated with
  it (`src/game/platform_displacement.c@9921382`). Farm's boat is a grid switch (`farmer.aboard`), not a
  carrier. **Not for us.** If a moving platform ever comes (a ferry, a cart), carry the rider by the
  platform's last-tick delta before the rider's own step. That rule is deterministic.

## The camera

- **Asymptotic approach.** The camera moves toward its goal by a fixed fraction every frame, at a fixed
  30 fps, so the smoothing depends on the frame rate (`src/game/camera.c@9921382`,
  `set_or_approach_vec3f_asymptotic`). Ours: [`expSmooth`](../../engine/core/src/render/camera.ts) takes
  the frame's `dt`. **Already have, and better.**
- **Pan ahead.** The focus leads the player in the direction it faces, building up slowly and decaying when
  the player stops (the pan-ahead step in `src/game/camera.c@9921382`). Ours: Farm's camera targets Pip
  plus the drag offset, with no lead. **Not briefed.** It is a taste call: a fraction of a tile ahead of a
  walking Pip, eased with `expSmooth`, is the cheap version if the owner wants it.
- **The camera stays in playable space.** The per-frame camera update keeps the camera above the floor and
  out of walls (`src/game/camera.c@9921382`, `resolve_geometry_collisions`). Ours:
  [OrbitCamera](../../engine/core/src/render3d/camera3d.ts) clamps only pitch and distance. **Not
  briefed.** Hollow's terrain relief is small. Separately, and not an SM64 lesson: Farm's drag offset,
  Citadel's pan and Hollow's orbit target (`pan`) have no world-edge clamp, so a player can look off the map.
- **A mode table and per-area triggers.** About fifteen camera modes, switched by boxes placed per level.
  **Not for us.** Each of our cameras has one job.

## The frame and the scene

- **Static display lists and a per-frame pool.** Level geometry is built once. Per-frame matrices and
  vertices come from a display-list pool that alternates between two buffers and resets each frame, so a
  frame does no heap work (`src/game/memory.c@9921382`, `alloc_display_list`;
  `src/game/game_init.c@9921382`, `select_gfx_pool`). Ours: Hollow's
  [`frame()`](../../games/hollow/client/src/render3d/app.ts) rebuilds and repacks the ground and every
  territory tile each frame. It also makes new maps, sets and arrays per frame, and `separateCircles`
  builds a new spatial hash on each of its four iterations. Brief 20 profiled only Farm and MateQuest.
  **Borrow: brief 24.**
- **Levels and models as data scripts.** Levels are command lists run by a small interpreter
  (`src/engine/level_script.c@9921382`), and models are geo layouts with culling, level-of-detail and
  switch nodes (`src/engine/geo_layout.c@9921382`). **Not for us.** Our worlds are generated from seeds
  and sim state, so there is no authored level to script. The builders are already pure and tested.
- **Culling and level of detail.** An object is drawn only if its culling radius is in view
  (`src/game/rendering_graph_node.c@9921382`, `obj_is_in_view`). A level-of-detail node picks children by
  depth (`geo_process_level_of_detail`). The animation counter advances before the cull, so a culled
  object keeps its timeline. Ours: brief 19 adds frustum culling to Hollow. **Level of detail: not now.**
  Revisit only if the phone estimate after brief 19 asks for it. Like the decompilation, brief 27 advances
  each agent's gait before the cull, beside the facing tracker, so an agent coming back into view needs no
  catch-up.
- **Play modes and transitions.** Normal, paused, area change, level change and frame advance, each with
  its own update, plus a transition record that freezes the world (`src/game/level_update.c@9921382`).
  Ours: a worker pauses by returning a batch of 0 to [the tick pump](../../engine/core/src/runtime/tick-pump.ts).
  **Not for us.** No client has a transition to freeze for.
- **The profiler.** Coloured bars show where in one frame each thread started and stopped, against the
  frame budget (`src/game/profiler.c@9921382`, `draw_profiler_bar`). Ours:
  [frame-profile.ts](../../engine/core/src/debug/frame-profile.ts) gives percentiles, GPU timer queries,
  heap samples, GL counters and an export. **Already have the numbers.** A per-frame bar view is not needed
  with one draw thread.

## Animation

- **Playback rate from speed.** Each object advances its animation by its own fractional rate
  (`src/engine/graph_node.c@9921382`, `geo_update_animation_frame`). The walk sets that rate from the
  forward speed, with a floor (`src/game/mario_actions_moving.c@9921382`, the walk animation function).
  Ours: Hollow's [`walkPhase`](../../games/hollow/client/src/render3d/agent-anim.ts) reads the render clock
  at a fixed 1.6 Hz, whatever the agent's speed. So at the 8× sim speed
  ([time-control.ts](../../games/hollow/client/src/time-control.ts)) agents slide, and `poseForAgent`
  keeps "walk" agents stepping in place while the sim is paused. **Borrow: brief 27.**
- **Compact index and value tables, and a loop start.** Animations are quantised per-bone channels with a
  separate loop start. **Not for us.** Ours are sprite frames and rigid mesh swaps, and a run-time rig was
  refused. A loop start could join brief 22's declaration if a clip ever needs an intro.

## Elsewhere

- **One global random generator.** Every object draws from one 16-bit generator
  (`src/engine/behavior_script.c@9921382`, `random_u16`), so the order of calls couples unrelated
  behaviour. Ours: [`Rng.fork(label)`](../../engine/core/src/runtime/rng.ts). **Already have, and
  better.**
- **Save blocks with a magic number, a checksum and a backup copy.** A bad block is restored from the good
  copy (`src/game/save_file.c@9921382`). Ours: MateQuest's mastery store is parsed with a version and
  tolerates corrupt data ([main.ts](../../games/mathquest/client/src/main.ts)). **Not for us.** Browser
  storage writes a key atomically, so the torn write the backup guards against does not happen.

## What became briefs

| Brief | Idea | Proof that the baseline holds |
|---|---|---|
| [24](../briefs/done/24-hollow-builds-its-static-draws-once.md) | Hollow builds territory and ground draws per snapshot, and its frame allocates less. Done 2026-11-23: 451 K to 269 K bytes a frame (-40%) | Render only: the bench counters are unchanged within noise |
| [25](../briefs/done/25-farm-finds-tile-features-by-cell.md) | Farm keeps a tile-feature index rebuilt only when features change, and the ECS pins its query order. Done 2026-11-23: the grid stamp fell from 0.023 to 0.001 ms a tick, Pip's system from 0.044 to 0.021 ms | Multi-seed `EXPORT=json` diff, byte-identical |
| [26](../briefs/todo/26-the-state-machine-keeps-its-entry-tick.md) | One engine helper keeps `enteredTick` true on every state change | Multi-seed diff for Farm and Hollow, byte-identical |
| [27](../briefs/todo/27-hollow-walks-by-the-ground-covered.md) | Hollow's gait advances with the distance walked, capped, and holds when the agent stops | Render only, the sim is not touched |

## Not verified

- `object_collision.c` beyond the player's pass, and most of `camera.c`, were skimmed, not read whole.
