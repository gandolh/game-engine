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
</content>
