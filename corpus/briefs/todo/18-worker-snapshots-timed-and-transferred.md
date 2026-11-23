# Task 18: worker snapshots timed, and transferred in one game

**Origin:** the [worker snapshot todo](../../todos/2026-11-20-worker-snapshot-transfer.md), promoted by the
owner on 2026-11-23 with the rest of the measure-first todos: build light optimizations that are not too
heavy, complex or wide ([decisions.md](../../wiki/decisions.md) → Frame budget). The plan is
[frame-budget.md](../../wiki/frame-budget.md).

**Builder:** Sonnet ([routing.md](../../routing.md)).

**Depends on:** none.

## Context

Citadel, Hollow and MateQuest run their sims in a Web Worker and post each snapshot as a plain object
(`games/*/client/src/worker/sim-worker.ts`). `postMessage` copies it with structured clone, and the main
thread deserialises the copy before the frame can use it.

CPU profiles on the laptop ([real-gpu-readings.md](../../wiki/real-gpu-readings.md), "Main-thread time
outside the frame") show that the JavaScript side costs about nothing: Citadel's handler takes 0.005 ms a
frame, and Hollow's handler time is its chronicle's DOM append, not the snapshot. The copy itself runs in
native code the profile can't separate, inside 0.7–1.0 ms a frame of unattributed native time. Nobody knows
its size.

Converting every game to typed-array snapshots would touch three sims' snapshot builders and three
clients. That is too wide for one brief. This one measures all three and converts only the game that costs
most, and only its per-entity positions.

## Files you OWN

- `games/citadel/client/src/worker/`, `games/hollow/client/src/worker/`,
  `games/mathquest/client/src/worker/` (the posting side), and each client's message handler
  (`games/citadel/client/src/worker/sim-client.ts`, `games/hollow/client/src/mount.ts`,
  `games/mathquest/client/src/main.ts`), for the timers
- For the one game you convert: its snapshot type and builder, its interpolation's read of positions, and
  their tests
- `corpus/` pages for this brief: the outcome, `log.md`, the todo's status line,
  [frame-budget.md](../../wiki/frame-budget.md) and [real-gpu-readings.md](../../wiki/real-gpu-readings.md)

## Files you must NOT touch

- The sims' systems and their determinism. The snapshot is render-facing; nothing in the sim changes.
- The two games you don't convert, beyond their timers.

## What to do

1. **Time the copy on both sides.** In each worker, time `postMessage` for the snapshot. In each client,
   time the first read of `event.data`, which is where Chrome deserialises it, and the handler. Record them
   through the frame profiler as `snapshot.post` (sent back with the next message, or logged), `snapshot.read`
   and `snapshot.apply`, so the export carries them. Count the bytes once with `structuredClone` timing or a
   JSON length as a rough size.
2. **Pick the costliest game** from the headless bench: the highest `snapshot.read` p95.
3. **Move its per-entity positions and frames into typed arrays** (`Float32Array` for positions,
   `Uint16Array` for frame indices) sent in the transfer list, so nothing is copied. Names, tooltips and
   other strings stay in the plain object. The interpolation reads the arrays.

## Acceptance

- The headless bench of all three games records `snapshot.read` and `snapshot.apply`; their p95s before
  and after are in the outcome.
- In the converted game, `snapshot.read` p95 falls, and a test round-trips a snapshot through the typed
  arrays and gets the same positions and frames.
- `npm run sim:citadel` and `npm run sim:hollow` print the same results as before (the sim is untouched).
- `npm run check` exits 0, and `bash corpus/lint.sh` passes.

## Owner steps

- Deploy the converted game and the two with new timers, from the vps-deploy checkout:
  `node cli.ts citadel deploy`, `node cli.ts hollow deploy` and `node cli.ts mathquest deploy`.
