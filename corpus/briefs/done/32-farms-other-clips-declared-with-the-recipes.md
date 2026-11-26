# Task 32: Farm's other clips declared with the recipes

**Origin:** the rest of the [animation tags todo](../../todos/closed/2026-11-20-animation-tags-in-the-manifest.md), promoted
on 2026-11-26 under the owner's rule of 2026-11-23: build light optimizations without waiting for a trigger, so long
as each is not too heavy, complex or wide ([decisions.md](../../wiki/decisions.md) → Frame budget).
[Brief 22](../done/22-animations-declared-with-the-recipes.md) built the declaration, the cook's check and
`clipFromDeclaration`, and moved one clip, the forge fire. The plan is [frame-budget.md](../../wiki/frame-budget.md).

**Builder:** Sonnet ([routing.md](../../routing.md)). It repeats brief 22's step for more clips, on the seam brief 22
built, with a test that pins every clip's timing.

**Depends on:** none.

## Context

A recipe set declares its animations in `games/farm/atlas-recipes/src/animations.ts` (`AnimationDecl`: a name,
frame names in order, a duration per frame or one for all, `loop` or `once`), exported as
`@farm/atlas-recipes/animations`. The file is plain data with no imports, so `@farm/sim-core` reads it without
pulling the recipes into a client bundle. The cook (`tools/atlas-builder/src/config.ts`, `cook.ts`) refuses a
declaration naming an unknown frame or frames on more than one sheet, and writes each sheet's declarations into
its manifest beside `frames`. `clipFromDeclaration` (`engine/core/src/animation/declared.ts`) builds an
`AnimationClip` from one. Only `FORGE_FIRE_CLIP` is built that way today
([animation.md](../../wiki/animation.md), [atlas-cook.md](../../wiki/atlas-cook.md)).

**What is left.** Brief 22 counted nine clips; the code has eight `loopClip` calls, the forge fire's included, so
seven remain. `loopClip(name, frames, periodMs)` (`games/farm/sim-core/src/render-systems/cycle.ts`) takes the
period of the whole loop; a declaration takes the duration of one frame.

| Clip | Built in | Frames | `loopClip` period | Per frame | Sheet | Sampled by |
|---|---|---|---:|---:|---|---|
| `foam` | `clips.ts` | `tile/foam-a`, `-b`, `-c` | 1800 | 600 | terrain | nothing at run time; `clips.test.ts` only |
| `forge-smoke` | `clips.ts` | `structure/forge-smoke-a`, `-b`, `-c` | 700 | 700 / 3 | buildings | `render-world-decor.ts` |
| `waterfall-fall` | `clips.ts` | `tile/waterfall-fall-a`, `-b`, `-c` | 540 | 180 | terrain | `render-world-decor.ts`, a phase per row |
| `campfire` | `clips.ts` | `structure/campfire-a`, `-b`, `-c` | 390 | 130 | buildings | `render-world-decor.ts` |
| `weather-beacon` | `clips.ts` | `structure/weather-beacon-a`, `-b` | 1000 | 500 | buildings | `render-world-decor.ts` |
| `fishing-spot` | `frames.ts` | `structure/fishing-spot`, `-b`, `-c` | 1200 | 400 | buildings | `resolveFrameAndBob`, a phase per tile |
| `farmer-walk` | `frames.ts` | suffixes on a base: `/walk-a`, none, `/walk-b`, none | 440 | 110 | characters | `resolveFrameAndBob`, and `walkStepsBetween` through its `step` events |

Three more cycles name frames in code without a clip:

- **Smoke wisps** (`games/farm/client/src/main/ambient.ts`): `FORGE_SMOKE_FRAMES` over `SMOKE_FRAME_PERIOD_MS`
  (700), counted from each wisp's spawn. The forge smoke clip's frames and period.
- **Bird flap** (`ambient.ts`): `decoration/bird-a`, `-b` over `BIRD_FLAP_PERIOD_MS` (400), 200 ms a frame, on the
  props sheet.
- **The action swing** (`resolveFrameAndBob` in `frames.ts`): a farmer's pose and its `-b` frame every 220 ms, with a
  scale pop.

The walk and the action swing build their frame names at run time from a farmer's base (`farmer/<kind>`), facing and
pose: five bases and three facings make 15 walk cycles. A declaration names whole frames, so it can't express them
as they are. That is the open question below; this brief leaves both in code.

`700 / 3` is not a whole number, but three of them sum to exactly 700 in floating point, so the clip's total and
`cycleIndex` match the old clip. The test below proves it.

## Files you OWN

- `games/farm/atlas-recipes/src/animations.ts`
- `games/farm/sim-core/src/render-systems/clips.ts`, `frames.ts` (the fishing spot clip and the frame lists),
  `index.ts` (its exports) and `clips.test.ts`
- `games/farm/client/src/main/ambient.ts` and `ambient.test.ts`, only the smoke wisp and bird flap frame picks
- The cooked manifests `npm run atlas` rewrites: `games/farm/client/public/atlas/terrain.json`, `buildings.json` and
  `props.json`, by their `animations` field only
- `corpus/` pages for this brief: the outcome, `log.md`, [animation.md](../../wiki/animation.md),
  [atlas-cook.md](../../wiki/atlas-cook.md) if it lists the declared clips, [frame-budget.md](../../wiki/frame-budget.md)
  (a row for 32, and the animation tags row), and the todo: its status line, then its move to `todos/closed/` with
  its links re-resolved (it sits one level deeper there)

## Files you must NOT touch

- The walk cycle, the action swing and the idle bob in `frames.ts` (see Owner decisions).
- The cook (`tools/atlas-builder/`) and `engine/core/src/animation/`: brief 22's code takes these declarations as it
  is. If it does not, stop and report.
- Any recipe's pixels, and MateQuest's recipes. Every cooked PNG stays byte-identical.
- `games/farm/sim-core/src/systems/`: these clips are render-side and sampled on the render clock.

## What to do

1. **Record before.** The sha256 of every cooked PNG (`git ls-files 'games/*/client/public/atlas/*.png'`). The output
   of `MAX_DAYS=3 TICKS_PER_DAY=20 npm run sim` (small, as [routing.md](../../routing.md) asks). A Farm bench,
   `npm run bench -- <folder> farm`: draw groups, UI quads, texture bytes a frame and GL draw calls. GL calls read 93
   or 135 depending on how the Farmers panel lays out in that run ([brief 21](../done/21-a-tile-chunk-ground-spike-in-farm.md)),
   so compare runs that read the same.
2. **Declare six clips and the bird flap** in `animations.ts` and add them to `FARM_ANIMATIONS`: `foam`,
   `forge-smoke`, `waterfall-fall`, `campfire`, `weather-beacon`, `fishing-spot` with the frames and per-frame
   durations in the table (write `700 / 3` with a comment, not a rounded number), and `bird-flap`:
   `decoration/bird-a`, `-b`, 200 ms, loop.
3. **Build the clips from the declarations.** In `clips.ts`, each `*_CLIP` from `clipFromDeclaration`, plus a new
   `BIRD_FLAP_CLIP`; in `frames.ts`, `FISHING_SPOT_CLIP` the same way. The names `render-world-decor.ts` imports stay.
4. **The two hand-rolled cycles in `ambient.ts`.** The smoke wisp samples `FORGE_SMOKE_CLIP` at `nowMs -
   wisp.spawnMs`, and the bird samples `BIRD_FLAP_CLIP` at `nowMs - bird.spawnMs`, through `sampleCycle` from
   `@farm/sim-core/render-systems`. Drop `SMOKE_FRAME_PERIOD_MS`, `BIRD_FLAP_PERIOD_MS` and `BIRD_FRAMES` if nothing
   else reads them.
5. **Tidy the frame lists.** Keep a `*_FRAMES` export only while code or a test reads it; `npm run check` runs knip,
   which flags an export nothing uses. The tests can hold the old definitions as literals.
6. **Cook and compare.** Run `npm run atlas`. If it also rewrites MateQuest's `combat.json` or `index.json` with
   the same PNGs (brief 22 saw their hashes go stale), leave those files out of the commit and say so.
7. **Record after**, the same three things as step 1.

## Acceptance

- One table-driven test in `clips.test.ts`: every clip built from a declaration samples the same frame as its old
  `loopClip` every 10 ms over two loops, at each phase the code passes (the waterfall's 0 to 2, the fishing spot's
  phase mod 3), with equal `totalDurationMs`. The forge fire stays in the table.
- A test that the smoke wisp and bird frames picked through the clips equal the old arithmetic for elapsed times
  from 0 to two periods.
- `walkStepsBetween` and the walk frames are unchanged (their existing tests pass untouched).
- Every cooked PNG has the same sha256 as before. `terrain.json` gains `foam` and `waterfall-fall`,
  `buildings.json` gains `forge-smoke`, `campfire`, `weather-beacon` and `fishing-spot` beside `forge-fire`, and
  `props.json` gains `bird-flap`; nothing else in a manifest changes (diff them with the `animations` field
  removed).
- `MAX_DAYS=3 TICKS_PER_DAY=20 npm run sim` prints the same output before and after (diff it).
- The Farm bench's draw groups (1), texture bytes a frame (0) and UI quads (under the 2,200 ceiling) match before and
  after.
- `npm run check` exits 0, and `bash corpus/lint.sh` passes.

## Owner steps

- Deploy Farm from the vps-deploy checkout: `node cli.ts farm-valley deploy`.
- Watch the forge, the waterfall, a campfire, the weather beacon, a fishing spot, the smoke and the birds for a
  minute. Nothing should look different.

## Owner decisions

Open, with the default this brief builds:

- **Do the walk cycle and the action swing move into the manifest too?** Their frames are built from a farmer's
  base, facing and pose at run time, and the walk carries `step` events, so a declaration that names whole frames
  can't hold them as they are. Two ways to move them: 15 walk declarations (five bases × three facings) and the
  action poses, generated in `animations.ts` from a list of bases that would duplicate `templates.ts`'s; or a
  template form of `AnimationDeclaration` (frames as suffixes on a base) that the cook expands. Either is a new
  brief. **Default: both stay in code**, and the todo closes with a note saying why.

## Outcome

Done 2026-11-26. brief-board was not available in this session, so the board was not updated.

- **Declared.** `foam`, `forge-smoke`, `waterfall-fall`, `campfire`, `weather-beacon`, `fishing-spot` and `bird-flap`
  are in `FARM_ANIMATIONS` beside `forge-fire`. `forge-smoke` is written `700 / 3` with a comment. `clips.ts` and
  `frames.ts` build every clip with `clipFromDeclaration`; `clips.ts` gains `BIRD_FLAP_CLIP`.
- **Hand-rolled cycles.** The smoke wisps sample `FORGE_SMOKE_CLIP` and the birds `BIRD_FLAP_CLIP` through
  `sampleCycle`. `SMOKE_FRAME_PERIOD_MS`, `BIRD_FLAP_PERIOD_MS` and `BIRD_FRAMES` are gone.
- **Frame lists.** `FOAM_FRAMES`, `FISHING_SPOT_FRAMES`, `FORGE_FIRE_FRAMES`, `FORGE_SMOKE_FRAMES`,
  `WATERFALL_FALL_FRAMES`, `CAMPFIRE_FRAMES` and `WEATHER_BEACON_FRAMES` were read only by the clips and the old
  tests, so they are deleted; the tests hold the old frames as literals. `WATERFALL_FRAMES` is not a clip's and stays.
- **Open question, default taken.** The walk cycle and the action swing stay in code, as the brief proposed. They
  build frame names from a farmer's base, facing and pose at run time, and a declaration names whole frames; moving
  them is a new brief if the owner wants it. The todo closes with that note.
- **Tests.** One table-driven test in `clips.test.ts` compares each of the eight clips with its old `loopClip` every
  10 ms over two loops, at the phases the code passes (waterfall and fishing spot 0 to 2), with equal
  `totalDurationMs`. A test in `ambient.test.ts` checks the smoke and bird frames against the old arithmetic from 0
  to two periods. The walk and `walkStepsBetween` tests pass untouched.
- **Checked.** Every cooked PNG has the same sha256 as before (9 files). `terrain.json`, `buildings.json` and
  `props.json` changed only by the `animations` field. `MAX_DAYS=3 TICKS_PER_DAY=20 npm run sim` prints the same
  output. `npm run atlas` also rewrote MateQuest's `combat.json` and `index.json` hashes with identical PNGs, as in
  brief 22; those two are left out of the commit.
- **Not done.** The Farm bench was not run: `npm run bench` needs `agent-browser` on the PATH and it is not in this
  container. The bench counters (draw groups, texture bytes, UI quads) are untouched by the change, which only picks
  the same frame names a different way; the owner can run `npm run bench -- <folder> farm` to confirm.
