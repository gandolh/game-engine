# Task 07: the real-GPU baseline

**Origin:** the owner, 2026-11-20: hold at least 60 fps. The plan is
[frame-budget.md](../../wiki/frame-budget.md).

**Depends on:** brief 06 (the bench scenes), and the owner's sitting below, which comes first.

## Context

No game has been read on a real GPU since the WebGL2-only migration on 2026-08-18. Status has also
carried an open owner check since 2026-11-03: Hollow ran at 50 ms per frame framed in the portal
against 33 ms direct, but only on SwiftShader under load. This brief turns one sitting of the owner
into the baseline that every later brief and todo is measured against.

## Owner step first

1. **Deploy what briefs 05 and 06 changed,** so the phone can reach the bench. Push game-engine,
   then from the vps-deploy checkout run `node cli.ts farm-valley deploy`, `node cli.ts citadel
   deploy`, `node cli.ts hollow deploy`, `node cli.ts mathquest deploy` and `node cli.ts
   games-portal deploy`. The laptop can use `npm run serve-all -w @game-engine/portal` instead.
2. **Sit before briefs 08 and 10 ship,** if you want a real-GPU "before" for those two reverts.
   After them, the baseline only has the "after".
3. **On each reference device,** the Windows laptop with the AMD integrated GPU and the Android
   phone, both in Chrome, open each game at `?bench&profile` and save the result file when the run
   ends.
4. **On the laptop, also run Hollow** through the portal's play page and then directly, both with
   `?bench&profile`.
5. **Put the files in `corpus/verify/`** under a folder named for the date, and say which file is
   which device.

That makes ten files: four games on two devices, plus Hollow framed and direct.

## Files you OWN

- `corpus/verify/<date>-real-gpu-baseline/` (the owner's files, with a short README naming each)
- [performance-measurements.md](../../wiki/performance-measurements.md) (a new dated section),
  [frame-budget.md](../../wiki/frame-budget.md) (the budgets per scene and the todo table),
  [portal.md](../../wiki/portal.md) and [status.md](../../wiki/status.md) (the Hollow framed check)
- New briefs in `corpus/briefs/todo/` for any todo whose trigger fired, and the status line of each
  of those todos
- `log.md`

## Files you must NOT touch

- Any code. This brief reads numbers and writes them down.

## What to do

1. **Record the readings.** For each game and device, give the frame interval at p50, p95 and p99,
   the long-frame shares, the GPU time where it was available, the counters and the heap pattern.
   Say plainly which games meet the bar and which don't.
2. **Set the budgets.** In [frame-budget.md](../../wiki/frame-budget.md), give each scene a ceiling
   for draw groups, UI quads and texture megabytes: the measured value plus 20%, rounded. Later
   briefs gate on these headless.
3. **Check every trigger.** Go through the todo table in [frame-budget.md](../../wiki/frame-budget.md).
   For each todo whose trigger fired, write a numbered brief, quote the number in its Context, and set
   the todo's status to `promoted to brief NN`. A todo whose trigger did not fire stays open, and its
   row gets the measured value.
4. **Close the Hollow framed check** in [portal.md](../../wiki/portal.md) and
   [status.md](../../wiki/status.md), with the real numbers.

## Acceptance

- Every one of the owner's files is named in the verify README and appears in the new
  measurements section.
- [frame-budget.md](../../wiki/frame-budget.md) has a budget for every scene and a measured value
  or a promotion on every todo row.
- `bash corpus/lint.sh` passes.

## Owner steps

- The deploy and the sitting above, before the brief starts.

## Progress (2026-11-23): the laptop half

The session read the laptop itself: Windows Chrome on the AMD iGPU, driven from WSL, against production
(identical to main for Farm, Citadel, Hollow and the portal) and a local build of main for MateQuest.
Two passes of the four scenes, Hollow framed and direct in both orders, a third Citadel pass, one
CPU-profiled Farm run and an emulated-phone pass. The files and how they were taken are in
`corpus/verify/2026-11-23-real-gpu-baseline/`.

Done from "What to do":

1. The laptop readings, on [real-gpu-readings.md](../../wiki/real-gpu-readings.md), with a pointer from
   [performance-measurements.md](../../wiki/performance-measurements.md).
2. The budgets per scene, on [frame-budget.md](../../wiki/frame-budget.md), from a headless run of main
   at 1280×800.
3. Every todo row has the laptop's value. The sprite sort fired and is
   [brief 15](15-the-sprite-sort-under-1-ms.md); the others stay open.
4. The Hollow framed check is closed in [portal.md](../../wiki/portal.md) and
   [status.md](../../wiki/status.md): no gap.

Left for the phone half:

- The owner deploys MateQuest (`node cli.ts mathquest deploy` from the vps-deploy checkout), the one
  game production had behind main, then runs the four scenes in Chrome on the Android phone and saves
  each result.
- Their files go in the same verify folder under `phone/`. The phone rows go on
  [real-gpu-readings.md](../../wiki/real-gpu-readings.md), and each still-open todo row gets its phone
  value or a promotion. Then this brief is done.
