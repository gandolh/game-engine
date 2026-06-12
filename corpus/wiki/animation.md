# Animation

How farmers, **Pip**, NPCs, and animated scenery are made to move. This page is the synthesis; the live task is [briefs/game/todo/85-animation-engine.md](../briefs/game/todo/85-animation-engine.md).

## The sprite art is richer than the code that drives it

Every character — the 4 personalities (`conservative`/`aggressive`/`hoarder`/`opportunist`) **and Pip** — has a full 16-frame set in the `characters` sheet ([characters.json](../../packages/farm-valley/public/atlas/characters.json), recipes under [tools/atlas-builder/src/recipes/assets/farmer/](../../tools/atlas-builder/src/recipes/assets/farmer/)):

- **3 facings** — `down` (base/front), `up` (back), `side` (right profile; left = `flipX`).
- **walk-a / walk-b per facing** → `down`+`{walk-a,walk-b}`, `up/...`, `side/...` (9 frames).
- **7 action poses** — `till`, `water`, `refill`, `chop`, `mine`, `plant`, `work` (built from [templates.ts](../../tools/atlas-builder/src/recipes/templates.ts), one frame each).

Pip is **not** a recolored farmer — it has its own `farmer/pip/*` set (gold hair, green tunic; cottage variant `structure/cottage-pip`). So the art is solid; the weak link is the *animation logic*, which is ad-hoc and scattered.

## Where animation actually happens today (scattered, no abstraction)

*(The table below is the **pre-brief-85 "before" picture** — the motivation. Current state: all four gaps are closed; see "Direction" / brief 85 status.)*

| Effect | Side | Where | Mechanism | Quality |
|---|---|---|---|---|
| Walk cycle | sim | `pickFarmerFrame` (now retired) | `(tick>>1)&1` toggles walk-a/walk-b every 2 ticks; suffix baked into `SnapshotSprite.frame` | 2-frame A/B flip, no stride timing |
| Facing | sim | [snapshot-builder/sprites.ts](../../packages/sim-core/src/snapshot-builder/sprites.ts) | 4-way `Player.facing` → 3-way + `flipX` | fine (unchanged) |
| Action pose | render | [`resolveFrameAndBob`](../../packages/sim-core/src/render-systems/frames.ts) `ACTION_POSE` | `base + "/till"` etc — **one static frame for the whole action** | farmer *froze* while working |
| Idle bob | render | `resolveFrameAndBob` | per-entity `sin(nowMs/600 + id·1.3)·1.5px` | fine (unchanged) |
| NPC work | sim | [work-npc.ts](../../packages/sim-core/src/systems/work-npc.ts) | 2-frame `pose-a`/`pose-b` swing every 8 ticks (deterministic) | the model the farmers now match |
| Foam / forge-fire / forge-smoke / waterfall / campfire / beacon / fishing-spot | render | inline math in [render-loop.ts](../../packages/farm-valley/src/main/render-loop.ts) | each: `floor(nowMs/(period/len)) % len` | ~7 near-identical hand-rolled blocks |

**The gaps that motivated brief 85 — all now closed:**
1. ~~**Action poses don't animate**~~ → phase 2: `-b` strike frame per action, render-side swing.
2. ~~**Walk is a 2-frame flip**~~ → phase 3: render-side 4-phase stride with a passing pose.
3. ~~**No reusable abstraction**~~ → phase 1: `@engine/core/animation` + `cycle.ts`; the scattered cyclers + walk + action animation all flow through it.
4. ~~**A dead `SpriteAnim` stub**~~ → removed in phase 1.

## The brief-04 ghost (important lesson)

Engine brief [04-spatial-anim](../briefs/engine/done/04-spatial-anim.md) fully specced an `AnimationClip` + `Animator` engine. It **was built** (commit `0919cbc`, `packages/engine/src/animation/{clip,animator}.ts` + tests) and then **deleted as unused** in the `cleanup` commit `1d5f80c` (2026-06-04), alongside other dead modules. `status.md` still claimed it shipped — that drift is now corrected.

**Lesson:** the primitive rotted *because nothing consumed it*. Any reintroduction must wire it into real consumers in the same change, or it dies again.

## Direction: a small render-side animation engine, with consumers

Reintroduce the `AnimationClip` (immutable frames+durations, `sampleAt(elapsedMs)`) + `Animator` (per-entity registry/`play`/`update`) under `@engine/core/animation` — **render-side, wall-clock driven**. Frame phase is cosmetic, so this carries **zero determinism risk** and the sim stops needing to bake art strings into the snapshot. (The same `Animator.update(stepMs)` could be tick-driven if determinism were ever wanted — brief 04 anticipated both modes.)

**Phasing** (full detail + acceptance in [brief 85](../briefs/game/todo/85-animation-engine.md)):

1. **Engine primitive + immediate consumers (no new art).** ✅ **Done (2026-06-12).** Recovered `clip`/`animator` + tests, exported `@engine/core/animation`. The ~7 inline wall-clock cyclers now run through declarative `AnimationClip`s (`render-systems/{cycle,clips}.ts`) — the abstraction has real consumers so it won't rot like the brief-04 ghost. The dead `SpriteAnim` stub is removed.
2. **Action `-a/-b` art** ✅ **Done (2026-06-12).** `ACTION_TEMPLATES_B` adds a `-b` strike frame per action (tool/arm moves, head identical); `farmer/<p>/<action>-b` generated for all 5 personalities incl. Pip (35 frames). `resolveFrameAndBob` alternates `pose ↔ pose-b` on the wall clock — working farmers/Pip now swing their tool like the NPCs, replacing the phase-1 bob-offset interim.
3. **Render-side walk migration + 4-phase stride** ✅ **Done (2026-06-12).** The snapshot now carries a semantic `moving` flag (`frame` = the direction-less base look, no baked `/walk-a|b`); `resolveFrameAndBob` resolves facing + a 4-phase stride (contact-a → passing → contact-b → passing, the neutral frame as the passing pose) via the walk clip — wall-clock, decoupled from tick rate. `pickFarmerFrame` retired → `isFarmerMoving`. The interpolation `copySprite` propagates `moving` (and the pre-existing stale-`tintRgba`/`z` omission there is fixed). **No new art** — the 4-phase cycle reuses the three existing per-facing frames; truly-distinct extra poses are a deferred optional.

All three phases are shipped (render-only + generated atlas frames, no determinism impact). The animation is no longer ad-hoc: `pickFarmerFrame` + the bake/parse round-trip are gone, the scattered cyclers and the walk/action animations all flow through `@engine/core/animation` + the `cycle.ts` helpers. The **swing + stride feel still needs an in-browser look** (WebGPU won't render headless on the dev box) before brief 85 closes to done/.

## Research-backed improvement backlog (2026-06-12)

Web research on 2D animation architecture + pixel-art "juice", filtered against our actual renderer (`Sprite` honors per-sprite `width`/`height`/`rotation`/`flipX`; `pixelSnap=true` snaps *position* only, so scale/rotation tweens render fine at zoom with mild sub-pixel softness — the documented low-res caveat). Sources at the end.

**Validated — what we already do right (don't relitigate):**
- **Logic↔animation decoupling** via the semantic snapshot (`moving`/`facing`/`action` → render resolves the frame) is the textbook pattern (Unity Mecanim, Godot AnimationTree, the DDAC paper). Keep it.
- **No frame interpolation; interpolate position only.** Pixel-art consensus: never blend between hand-drawn frames; lerp *placement* (we do, with `alpha`), snap *frame*. Timing nuance comes from per-frame durations, not tweening.
- **4-way + flipX-for-left** is the Stardew convention; fine as-is.

**Backlog, ranked (impact / effort / risk):**

*Tier A — cheap juice pass, mostly no new art, low risk:* ✅ **DONE 2026-06-12** (render-only; awaiting feel-check)
1. ✅ **Engine easing module** `@engine/core/animation/easing.ts` — `easeOutBack`/`easeOutQuad`/`easeOutCubic`/`easeOutElastic`/`smoothstep`/`linear` + tests.
2. ✅ **Frame events on `AnimationClip`** — `events: {atMs, name}[]` + a stateless `eventsBetween(prevMs, curMs)` (handles loop wrap, caps huge windows). Fits our wall-clock sampling (no per-entity Animator needed). `loopClip` carries events.
3. ✅ **Footstep dust** — `WALK_CLIP` fires a `step` event at each contact phase; `walkStepsBetween(id, prev, now)` counts crossings; render-loop emits a pale puff at the feet for moving, on-screen, on-land farmers.
4. ✅ **Asymmetric idle bob** — replaced the pure sine with a quick-lift / slow-settle breath (`easeOutQuad`, ~1.3px up), per Slynyrd.
5. ✅ **Action scale-pop** — `resolveFrameAndBob` returns an optional `scale`; on the action strike (`-b`) half it pops to ~1.10 and settles via `easeOutQuad`, applied to the sprite `width`/`height` in `pushSnapshotSprites`. (Per-strike, stateless; a discrete harvest-only item-pop is a later refinement.)

*Tier B — structural, medium effort:* ✅ **DONE 2026-06-12** (the right-sized version — see note on the FSM)
6. ✅ **Atlas-existence guard test** — `enumerateFarmerFrames(base)` ([frames.ts](../../packages/sim-core/src/render-systems/frames.ts)) is the single source of truth for every frame the resolver can emit (idle/passing, walk phases per facing, action poses + `-b`); `farmer-frames.test.ts` asserts each exists in the built `characters` manifest. Closes the silent-missing-frame gap. (As a bonus it confirms all the phase-2/3 frames ship.)
7. ✅ **Formalized the frame vocabulary** — replaced ad-hoc `facing === "down" ? … : "/"+facing` string-building with a typed `FACING_SEG: Record<Facing, string>`, and centralized the emit-set in `enumerateFarmerFrames`. **Deliberately did NOT build a stateful transition-FSM**: our renderer is stateless per-frame (the snapshot already encodes the deterministic state — `action`/`moving`/`facing`), so the right shape is a *state→clip resolver* (which `resolveFrameAndBob` already is), not a per-entity transition machine. A transition-FSM only earns its keep with render-side one-shot triggers that outlive a tick (e.g. a harvest flourish / hurt flash via the existing `Animator.play`/`isFinished`) — deferred until such a need is concrete.
8. ⏸️ **Hit-pause** — deferred. Needs per-entity render-side state (a freeze timer), which our stateless model doesn't carry; low payoff for a gentle farming sim. Revisit if combat-ish feedback is ever wanted.

*Tier C — skip / N/A for us:*
- **Aseprite-JSON clip import** — N/A; our atlas is code-authored pixel recipes, not Aseprite. The data-driven *principle* is covered by #7.
- **Secondary motion (hair/hat lag), motion trails, per-action screenshake, 8-way** — 16px chars lack separable layers; trails muddy a slow sim (research warns); screenshake too aggressive per swing; we're deliberately 4-way.

**Pixel-snap caveat:** scale (#5) and any rotation lean draw fractional dest sizes (position is snapped, size isn't) → slight softening at low res, generally fine at 3–4× zoom; if it shimmers, the option is an opt-in no-snap for the character layer. Verify in the same feel-check as brief 85.

Sources — architecture: [Unity Animator](https://docs.unity3d.com/6000.3/Documentation/Manual/AnimationStateMachines.html) · [Godot AnimationTree](https://docs.godotengine.org/en/latest/tutorials/animation/animation_tree.html) · [Defold state machine](https://defold.com/examples/animation/animation_states/) · [Game Programming Patterns: State](https://gameprogrammingpatterns.com/state.html) · [Animancer frame events](https://kybernetik.com.au/animancer/docs/samples/events/footsteps/) · [Godot 8-direction recipe](https://kidscancode.org/godot_recipes/4.x/2d/8_direction/index.html). Juice/pixel-art: [Slynyrd Pixelblog 55 (top-down)](https://www.slynyrd.com/blog/2025/3/24/pixelblog-55-top-down-character-animation) · [Slynyrd 50 (walk cycle)](https://www.slynyrd.com/blog/2024/5/24/pixelblog-50-human-walk-cycle) · ["Juice it or Lose it"](https://www.youtube.com/watch?v=Fy0aCDmgnxg) · ["Art of Screenshake"](https://www.youtube.com/watch?v=AJdEqssNZ-U) · [easings.net](https://easings.net/) · [Penner easing](https://robertpenner.com/easing/) · [pixel-art animation fundamentals](https://www.pixel-editor.com/articles/sprite-animation-fundamentals).
</content>
