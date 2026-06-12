# Animation

How farmers, **Pip**, NPCs, and animated scenery are made to move. This page is the synthesis; the live task is [briefs/game/todo/85-animation-engine.md](../briefs/game/todo/85-animation-engine.md).

## The sprite art is richer than the code that drives it

Every character — the 4 personalities (`conservative`/`aggressive`/`hoarder`/`opportunist`) **and Pip** — has a full 16-frame set in the `characters` sheet ([characters.json](../../packages/farm-valley/public/atlas/characters.json), recipes under [tools/atlas-builder/src/recipes/assets/farmer/](../../tools/atlas-builder/src/recipes/assets/farmer/)):

- **3 facings** — `down` (base/front), `up` (back), `side` (right profile; left = `flipX`).
- **walk-a / walk-b per facing** → `down`+`{walk-a,walk-b}`, `up/...`, `side/...` (9 frames).
- **7 action poses** — `till`, `water`, `refill`, `chop`, `mine`, `plant`, `work` (built from [templates.ts](../../tools/atlas-builder/src/recipes/templates.ts), one frame each).

Pip is **not** a recolored farmer — it has its own `farmer/pip/*` set (gold hair, green tunic; cottage variant `structure/cottage-pip`). So the art is solid; the weak link is the *animation logic*, which is ad-hoc and scattered.

## Where animation actually happens today (scattered, no abstraction)

| Effect | Side | Where | Mechanism | Quality |
|---|---|---|---|---|
| Walk cycle | sim | [`pickFarmerFrame`](../../packages/sim-core/src/render-systems/frames.ts) | `(tick>>1)&1` toggles walk-a/walk-b every 2 ticks; suffix baked into `SnapshotSprite.frame` | 2-frame A/B flip, no stride timing |
| Facing | sim | [snapshot-builder/sprites.ts](../../packages/sim-core/src/snapshot-builder/sprites.ts) | 4-way `Player.facing` → 3-way + `flipX` | fine |
| Action pose | render | [`resolveFrameAndBob`](../../packages/sim-core/src/render-systems/frames.ts) `ACTION_POSE` | `base + "/till"` etc — **one static frame for the whole action** | farmer *freezes* while working |
| Idle bob | render | `resolveFrameAndBob` | per-entity `sin(nowMs/600 + id·1.3)·1.5px` | fine |
| NPC work | sim | [work-npc.ts](../../packages/sim-core/src/systems/work-npc.ts) | 2-frame `pose-a`/`pose-b` swing every 8 ticks (deterministic) | **better than the farmers** |
| Foam / forge-fire / forge-smoke / waterfall / campfire / beacon / fishing-spot | render | [frames.ts](../../packages/sim-core/src/render-systems/frames.ts) consts + inline math in [render-loop.ts](../../packages/farm-valley/src/main/render-loop.ts) | each: `floor(nowMs/(period/len)) % len` | ~7 near-identical hand-rolled blocks |

**The gaps that matter:**
1. **Action poses don't animate.** A farmer tilling/chopping/mining holds one frozen frame for its whole `busyUntilTick` window — while the background NPCs swing a hammer/saw. The protagonists are stiffer than the extras (atlas only has one frame per action, so a frame-swing needs new art).
2. **Walk is a 2-frame flip**, not a timed stride.
3. **No reusable abstraction** — every cyclic effect is reimplemented inline.
4. **A dead stub already exists for this:** `SpriteAnim { clip, frame, elapsedMs, playing }` is declared in [trust.ts](../../packages/sim-core/src/components/trust.ts) and hung off the entity in [entity.ts](../../packages/sim-core/src/components/entity.ts) (`spriteAnim?`) — **never instantiated or read.**

## The brief-04 ghost (important lesson)

Engine brief [04-spatial-anim](../briefs/engine/done/04-spatial-anim.md) fully specced an `AnimationClip` + `Animator` engine. It **was built** (commit `0919cbc`, `packages/engine/src/animation/{clip,animator}.ts` + tests) and then **deleted as unused** in the `cleanup` commit `1d5f80c` (2026-06-04), alongside other dead modules. `status.md` still claimed it shipped — that drift is now corrected.

**Lesson:** the primitive rotted *because nothing consumed it*. Any reintroduction must wire it into real consumers in the same change, or it dies again.

## Direction: a small render-side animation engine, with consumers

Reintroduce the `AnimationClip` (immutable frames+durations, `sampleAt(elapsedMs)`) + `Animator` (per-entity registry/`play`/`update`) under `@engine/core/animation` — **render-side, wall-clock driven**. Frame phase is cosmetic, so this carries **zero determinism risk** and the sim stops needing to bake art strings into the snapshot. (The same `Animator.update(stepMs)` could be tick-driven if determinism were ever wanted — brief 04 anticipated both modes.)

**Phasing** (full detail + acceptance in [brief 85](../briefs/game/todo/85-animation-engine.md)):

1. **Engine primitive + immediate consumers (no new art).** Recover `clip`/`animator` + tests; export `@engine/core/animation`. Replace the ~7 inline wall-clock cyclers with declarative `AnimationClip`s (so the abstraction has real consumers and won't rot). Give working farmers/Pip a render-side **action swing** so they stop freezing mid-action.
2. **Action `-a/-b` art** → frame-based work swings for farmers/Pip (atlas-builder recipes), matching NPC quality; replaces the phase-1 swing hack.
3. **4-frame walk art + render-side walk migration** — ship semantic walk state on the snapshot and resolve the stride render-side via the `Animator`, retiring `pickFarmerFrame`.

Phase 1 is render-only and self-contained; 2–3 depend on new pixel art and can land independently.
</content>
