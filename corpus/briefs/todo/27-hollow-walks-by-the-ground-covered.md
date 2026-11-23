# Task 27: Hollow walks by the ground covered

**Origin:** the [Super Mario 64 decompilation research](../../wiki/research-sm64-decomp.md) of 2026-11-23,
"Animation".

**Builder:** Sonnet ([routing.md](../../routing.md)).

**Depends on:** brief 24 (both edit the agent loop in `games/hollow/client/src/render3d/app.ts`'s `frame()`).

## Context

The decompilation advances each object's animation by the object's own fractional rate
(`src/engine/graph_node.c@9921382`, `geo_update_animation_frame`). The walk sets that rate from the forward
speed, with a floor, so feet keep pace with the ground at any speed. The research page cites the walk code.

Hollow's gait reads the clock instead. `walkPhase(nowMs, agentId)` in
`games/hollow/client/src/render3d/agent-anim.ts` turns the render clock into a phase at a fixed
`WALK_HZ = 1.6`, and `gaitPoseFor` swaps the two gait meshes at phase 0.5. That causes two visible faults:

- **Sliding at speed.** The sim runs at 1×, 2×, 4× or 8× (`SPEED_OPTIONS` in
  `games/hollow/client/src/time-control.ts`). At 8× an agent crosses eight times the ground with the same
  leg cadence.
- **Stepping while paused.** `poseForAgent` keeps the gait pose whenever the agent's action is `"walk"`.
  That is on purpose, so an agent at a tile boundary doesn't flicker to its idle pose. But the clock keeps
  running when the sim is paused, so walking agents march in place.

`AgentFacingTracker` in the same file already keeps each agent's last interpolated position across frames,
and `app.ts` prunes it each frame. It runs for every agent before any cull.

## Files you OWN

- `games/hollow/client/src/render3d/agent-anim.ts` and `agent-anim.test.ts`
- `games/hollow/client/src/render3d/app.ts`, only the agent loop's calls to the gait functions
- `corpus/` pages for this brief: the outcome, `log.md`, the brief-27 row of
  [research-sm64-decomp.md](../../wiki/research-sm64-decomp.md), and [hollow-overview.md](../../wiki/hollow-overview.md)
  if it describes the walk cycle

## Files you must NOT touch

- Hollow's sim, its worker and the snapshot: the gait stays render-only.
- The gait meshes and `humanoid.ts`'s poses.
- Farm's walk clip (`games/farm/sim-core/src/render-systems/frames.ts`). It has the same clock-driven shape;
  a Farm version is a follow-up brief if the owner wants it.

## What to do

1. **Advance the phase by distance.** Keep a gait phase per agent beside the facing tracker, pruned the
   same way. Each frame, add the interpolated distance the agent covered divided by a stride length. Pick
   the stride so an agent walking at 1× keeps the current 1.6 Hz: measure the tiles per second of a walking
   agent at 1× from interpolated positions, and write the number and how you got it in a comment.
2. **Cap the cadence** at `MAX_GAIT_HZ` (4 Hz unless the owner picks otherwise), so the two gait meshes don't
   flicker at 8×.
3. **Hold when no ground is covered.** The phase stays put, so a paused or blocked walker holds mid-stride.
   `poseForAgent` keeps choosing the gait pose for `"walk"` agents, so nothing flickers to the idle pose.
4. **Keep the crowd out of step.** Each agent's phase starts from the existing `hashAgentId` offset.
5. **`walkBob` follows the same phase.**

## Acceptance

- Pure tests in `agent-anim.test.ts`:
  - no distance leaves the phase unchanged;
  - a distance `d` advances it by `d / stride`;
  - the cap holds at 8× ground speed;
  - two agents covering the same ground stay out of step.
- At 1×, a walking agent's cadence is within 10% of 1.6 Hz. Measure it over a short run, and put the number
  in the outcome.
- A short screen capture or frame strip in the outcome at 1×, at 8× and paused. At 8× legs cycle faster, up
  to the cap. Paused, nobody steps.
- The sim is not touched, so the baseline cannot move. No export diff is needed.
- `npm run check` exits 0, and `bash corpus/lint.sh` passes.

## Owner steps

- Deploy Hollow from the vps-deploy checkout: `node cli.ts hollow deploy`.
- Watch a crowd at 8× and paused, and say if the cadence cap reads right.

## Owner decisions

Settled with the owner on 2026-11-23:

- **The cap at 8×: 4 Hz.** Legs stay readable; a walker slides slightly once the cap is hit.
- **A paused walker holds mid-stride**, as games do when paused (the controller's call, not asked).
