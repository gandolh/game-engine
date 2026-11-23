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
   [brief 15](../todo/15-the-sprite-sort-under-1-ms.md); the others stay open.
4. The Hollow framed check is closed in [portal.md](../../wiki/portal.md) and
   [status.md](../../wiki/status.md): no gap.

The phone half was dropped. On 2026-11-23 the owner decided the phone is estimated from the laptop,
not measured ([decisions.md](../../wiki/decisions.md) → Frame budget).

## Outcome (2026-11-23)

Done on the laptop alone, by the owner's call above.

- **Readings.** [real-gpu-readings.md](../../wiki/real-gpu-readings.md) records every file in
  `corpus/verify/2026-11-23-real-gpu-baseline/`. Citadel, Hollow and MateQuest meet the bar with room to
  spare. Farm meets it at its edge: about 13% of its frames take two 120 Hz refreshes, and it is CPU-bound
  at 6.1–6.3 ms a frame. Every Farm run also has one 150–675 ms hitch early in the sweep, outside
  JavaScript, not yet placed.
- **Budgets.** Every scene has its ceilings on [frame-budget.md](../../wiki/frame-budget.md), from a
  headless run of main at 1280×800. MateQuest's UI quad ceiling is soft, because its mean follows the
  headless tick count.
- **Triggers.** The sprite sort fired: `compareSprite` alone costs Farm 1.07 ms a frame. It is
  [brief 15](../todo/15-the-sprite-sort-under-1-ms.md). Every other row has the laptop's value and stays
  open. The worker snapshot row is measured as far as a CPU profile reaches: storing a snapshot costs about
  0 ms in all three worker games, and Hollow's handler time is its chronicle's DOM append. The
  structured-clone copy itself still needs a named timer.
- **Hollow framed.** No gap on a real GPU, so the 2026-11-03 check is closed and Hollow keeps its frame.
- **The phone.** An estimate replaces the reading, at an assumed 4× (the session's choice): the CPU side
  from the emulated pass at a phone viewport, the GPU side from the laptop's GPU headroom. Farm misses by
  far on the CPU. Citadel's and Hollow's GPU straddle 4×, and Hollow's main thread is busy 15 ms a frame
  with DOM work. MateQuest fits.
- **Runs that drew nothing.** Some Windows Chrome runs between about 10:45 and 11:10 drew no frames. A rerun
  that failed the same way reported the page as hidden, and every game ran normally when it was visible.
  The owner's own Hollow export was a partial profiler export, not a bench result, and is not used.
