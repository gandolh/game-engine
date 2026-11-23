# Task 26: the state machine keeps its entry tick

**Origin:** the [Super Mario 64 decompilation research](../../wiki/research-sm64-decomp.md) of 2026-11-23,
"Objects".

**Builder:** Sonnet ([routing.md](../../routing.md)).

**Depends on:** brief 25 (both edit `games/farm/sim-core/src/systems/player-control/system.ts`).

## Context

In the decompilation, every object's update compares the object's action with last update's. When they
differ, the engine zeroes the object's timer and sub-action itself (`src/engine/behavior_script.c@9921382`,
`cur_obj_update`). Behaviour code only sets the action and never resets a timer by hand, so "how long in this
action" is always right.

This engine has the field and not the rule. `FsmState<S> { current; enteredTick }` lives in
`engine/core/src/ecs/components.ts` and is public API of the packaged `@engine/core`. `enteredTick` is set
when an agent spawns (`games/farm/sim-core/src/world-setup.ts`, `games/hollow/sim-core/src/population.ts`,
`games/hollow/sim-core/src/family/reproduction-system.ts`) and never again. Fifteen sites in sim and engine
code assign `fsm.current` directly (a repo-wide grep on 2026-11-23 found no others outside tests):

- `engine/core/src/agent/deliberate-system.ts` (1)
- Farm: `systems/cognition/perceive.ts` (6), `systems/combat/system.ts` (4), `systems/act/system.ts` (1),
  `systems/world-time/finish-day.ts` (1), `systems/player-control/system.ts` (1)
- Hollow: `systems/perceive.ts` (1)

As of 2026-11-23 nothing reads `enteredTick`. So after an agent's first transition the field is wrong, and the first
system that asks "how long has this agent been in this state" gets a silent bug. Citadel's villagers keep
their own string state (`v.fsm`) and are out of scope.

## Files you OWN

- `engine/core/src/ecs/components.ts` and a helper beside it, the ECS barrel, and their tests
- `engine/core/src/agent/deliberate-system.ts`
- The Farm and Hollow write sites listed above, only to route them through the helper
- Tests that assign `fsm.current` directly, which the readonly fields will refuse: on 2026-11-23 these were
  Farm's `systems/act.test.ts`, `systems/act/handlers/resource.test.ts`, `systems/cognition/perceive.test.ts`
  and `systems/economy/ap.test.ts`, and Hollow's `mortality.test.ts` and `sim-bootstrap.social.test.ts`.
  Grep again (`fsm!?\.current\s*=`) before starting; clients, tools and `examples/` had none
- `corpus/` pages for this brief: the outcome, `log.md`, the brief-26 row of
  [research-sm64-decomp.md](../../wiki/research-sm64-decomp.md), and [glossary.md](../../wiki/glossary.md) only
  if a term is added

## Files you must NOT touch

- Any system's logic beyond the state write: which state is entered, and when, stays exactly as it is.
- Citadel's villager state.
- Farm's `busyUntilTick`. It is a deadline, a different thing, and it is clear as it is.

## What to do

1. **One writer.** Add `enterState(fsm, next, tick)` beside `FsmState`. It sets `current`, and sets
   `enteredTick` to `tick` only when `next` differs from `current`, as the decompilation resets its timer only
   on a real change. Export it with the ECS barrel.
2. **Let the type refuse other writers.** Mark `FsmState`'s fields `readonly`, so `npm run typecheck` fails
   on a direct assignment. Spawning with an object literal still works. The helper is the one place that
   writes, through a narrow cast with a comment.
3. **Route the fifteen sites through it.** Each system has the tick in its `SimContext`. Where a write sits in
   a helper without one, pass the tick in.
4. **Say what the field means** in a doc comment on `FsmState`: the tick the agent entered `current`.

## Acceptance

- A unit test: a write of the same state keeps `enteredTick`, and a change sets it to the given tick.
- A direct `fsm.current = …` added anywhere fails `npm run typecheck`. Show this once in the outcome, then
  remove it.
- The baseline does not move, because nothing reads the field. `CHECK_DETERMINISM=1` passes on
  `npm run sim` and `npm run sim:hollow`. For three seeds each, Farm's `npm run sim` with `EXPORT=json`
  (`MAX_DAYS=10`) and Hollow's `npm run sim:hollow` with `EXPORT=json` and an `EXPORT_DIR` (a short `DAYS`)
  give byte-identical files before and after.
- `npm run check` exits 0, and `bash corpus/lint.sh` passes.

## Owner steps

- None required: no player sees a change. It ships with Farm's and Hollow's next deploys.

## Owner decisions

- None. Keeping the field and making it true was picked over deleting it, because `FsmState` is public API
  of the packaged engine, and a time-in-state reading is what the decompilation's behaviours lean on most.

## Outcome (2026-11-23)

`enterState(fsm, next, tick)` now sits beside `FsmState` in `engine/core/src/ecs/components.ts` and is exported
from the ECS barrel. It sets `current` and moves `enteredTick` to `tick` only when `next` differs from `current`.
`FsmState`'s two fields are `readonly`, and the helper is the one writer, through a narrow cast with a comment.
`FsmState` has a doc comment saying `enteredTick` is the tick the agent entered `current`.

- **Sites.** All fifteen go through the helper, each with the same state at the same moment as before:
  `deliberate-system.ts` (1), Farm `perceive.ts` (6), `combat/system.ts` (4), `act/system.ts` (1),
  `finish-day.ts` (1), `player-control/system.ts` (1) and Hollow `perceive.ts` (1). Farm's `perceive.ts`
  `handlePhaseStart` and the combat `endBout`, `resolveKo` and `resolveExhaustion` had no tick, so each takes
  one as a parameter from the caller's `SimContext` (`stepBout` already had it). `finish-day.ts` and
  `player-control/system.ts` now name their `ctx`. The six tests that assigned `fsm.current` use
  `enterState(..., 0)`.
- **Grep.** `fsm!?\.current\s*=` found the 15 sites and the 6 tests before and none after: the helper writes through a local alias, and spawns use object literals.
- **Unit test.** `engine/core/src/ecs/fsm.test.ts`: the same state keeps `enteredTick`, a change sets it.
- **Typecheck refusal.** A scratch `f.fsm.current = "B"` added to `finish-day.ts` failed with
  `src/systems/world-time/finish-day.ts(20,93): error TS2540: Cannot assign to 'current' because it is a read-only property.`
  It was removed before the commit.
- **Baseline.** Farm `npm run sim` with `EXPORT=json MAX_DAYS=10` for seeds 1, 2, 3, and Hollow `npm run sim:hollow`
  with `EXPORT=json MAX_YEARS=2` and an `EXPORT_DIR` per seed (Hollow has no `DAYS` knob; its length is
  `MAX_YEARS`): `cmp` on the Farm files and `diff -r` on the Hollow directories were identical before and after.
  No export file carried a wall-clock field. `CHECK_DETERMINISM=1` passed on `npm run sim` and `npm run sim:hollow`.
- **Shipped** with Farm and Hollow in the owner's rollout of 2026-11-23 (stamped `acd92ea`). No owner step.
