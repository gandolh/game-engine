# Task 18: worker snapshots timed, and transferred in one game

**Origin:** the [worker snapshot todo](../../todos/closed/2026-11-20-worker-snapshot-transfer.md), promoted by the
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

## Outcome (2026-11-23)

The timers shipped. The conversion was built, measured and dropped: it did not lower Hollow's `snapshot.read`, so
that Acceptance bullet is **not met**, and the code that ships is the timers alone (`11026ae1`).

**Timers.** `snapshot.post` (the worker's `postMessage`, sent back as `postMs` on the next snapshot message),
`snapshot.read` (the first read of `event.data`, where Chrome deserialises) and `snapshot.apply` (the handler)
are in the frame profile's `timers` for Citadel, Hollow and MateQuest, so `?profile` and the bench export carry
them. In Hollow the first reader is `render3d/app.ts`'s listener (registered before `mount.ts`'s), so the
timers live there.

**Bench, headless on SwiftShader, mean / p95 in ms (timer step 0.1 ms; load average 25-31 throughout).**

| Game | read before | read after | apply before | apply after | post before | post after |
|---|---|---|---|---|---|---|
| Citadel | 0.092 / 0.2 | 0.091 / 0.2 | 0.036 / 0.1 | 0.040 / 0.1 | 0.114 / 0.2 | 0.126 / 0.2 |
| Hollow | 0.300 / 0.6 | 0.359 / 0.7 (rerun 0.344 / 0.7) | 0.022 / 0.1 | 0.032 / 0.1 (rerun 0.074 / 0.1) | 0.274 / 0.4 | 0.284 / 0.5 (rerun 0.305 / 0.5) |
| MateQuest | 0.100 / 0.1 (1 sample) | 0.111 / 0.2 (9 samples) | 0.200 (1 sample) | 0.044 / 0.1 | 0 (1 sample) | 0.056 / 0.1 |

"After" is the tree with Hollow converted. Citadel and MateQuest were never converted, so their "after" columns
are noise. The "before" columns are the numbers for the tree as shipped. Sizes, offline (seed 1, tick 3000, not the
bench scene): Hollow 21,325 bytes of JSON and a 0.33 ms `structuredClone` (44 agents, 18,980 bytes of them the
agents); Citadel 5,060 bytes, 0.07 ms; MateQuest 1,438 bytes, 0.04 ms.

**Converted, then dropped: Hollow**, the costliest by a wide margin. Commit `ee7c3502` sent each agent's grid
position (`gx`, `gy`) as one `Float32Array` in the transfer list (`worker/snapshot-wire.ts`, a fresh array every
post), with a round-trip test. The closeout restored Hollow's client to `11026ae1`: about 100 lines of wire code
and widened types bought nothing measurable. `ee7c3502` stays in history if a later brief wants the seam.

**Why read did not fall.** An offline clone of the stripped snapshot plus the transferred array took 0.366 ms
against 0.355 ms for the full one. The 44 agents' 88 position numbers are a rounding error beside their
objects: `needs`, `inventory` and `appearance` records and strings. Cutting `snapshot.read` needs those moved
(a fixed need-kind order in a typed array, a string table), which the brief excludes. That is the next step if
the copy ever matters; at 0.3 ms read and 0.3 ms post every 50 ms it does not today.

`npm run sim:citadel` and `npm run sim:hollow` print the same output before and after (diffed).

## Owner steps (unchanged)

Deploy `node cli.ts citadel deploy`, `node cli.ts hollow deploy` and `node cli.ts mathquest deploy` from the
vps-deploy checkout. These deploys carry the timers only. Hollow's deploy has nothing else in it, so it can wait
for the next Hollow change (brief 19).
