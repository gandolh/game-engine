# Hollow merges its static geometry: before and after (brief 31)

Evidence for [brief 31](../../briefs/done/31-hollow-merges-its-static-geometry.md). Everything ran headless at
1280x800 on SwiftShader (frame times are stamped `gpu-not-real`), on a quiet 4-CPU machine. "Before" is `6096ffc`
plus the `draw.static` counter; "after" is the brief's change.

## Bench

`npm run bench -- <folder> hollow` (seed 42, the orbit scene), run through `agent-browser` 0.45.0 from a scratch
prefix with the pre-installed Chromium. The load average is `uptime`'s 1-minute figure at the start and end of
each run.

| Run | Load | `glDrawCalls` mean / p95 | `drawInstances` mean / p95 | `draw.static` | `frame` mean / p95 (CPU ms) |
| --- | --- | --- | --- | --- | --- |
| [before 1](hollow-bench-before-1.json) | 0.05-0.90 | 35.70 / 41 | 96.26 / 107 | 5 | 0.59 / 0.9 |
| [before 2](hollow-bench-before-2.json) | 0.64-1.08 | 35.87 / 41 | 96.11 / 107 | 5 | 0.57 / 0.8 |
| [after 1](hollow-bench-after-1.json) | 0.88-1.11 | 32.82 / 38 | 63.18 / 66 | 2 | 0.58 / 0.9 |
| [after 2](hollow-bench-after-2.json) | 1.11-1.63 | 32.79 / 38 | 63.23 / 66 | 2 | 0.58 / 0.9 |

Over a before run the old `TerritoryInstanceCache` built 11 times (the `tmp.territoryBuild` count in both before
files, a temporary counter that was not committed).

`static.merge`, the build and upload of a merged mesh, after the warm-up: 14 builds in each after run, mean
0.32 ms and 0.29 ms, p95 0.7 ms and 0.6 ms. Summed and divided by the frames drawn (1,672 and 1,682), that is
0.0027 ms and 0.0024 ms a frame, against the brief's 0.05 ms limit, so the homes stay in the changing mesh. The
fixed mesh (ground, hearth, graveyard) is built once, during the warm-up, so no run counts it.

## Draws by kind

The GL count moves with the agents, whose draws (one per skin, hair and pose variant in view) differ by about 0.1
from run to run. To separate them, `perkind-patch.py` patches a checkout, temporarily, so each frame records the
draws pushed, the GL draws issued after culling and the instances drawn, per kind. One run each:

| Kind | Before: draws pushed / GL draws / instances | After |
| --- | --- | --- |
| Static (ground, territory, hearth, graveyard, homes) | 5.00 / 5.00 / 34.81 | 2.00 / 2.00 / 2.00 |
| Resource nodes | 2.00 / 2.00 / 21.87 | 2.00 / 2.00 / 21.92 |
| Corpses | 0 / 0 / 0 | 0 / 0 / 0 |
| Agents | 28.90 / 28.77 / 39.37 | 29.00 / 28.88 / 39.42 |
| Total `glDrawCalls` | 35.77 | 32.88 |

Files: [before](hollow-perkind-before.json), [after](hollow-perkind-after.json). No static draw was culled
before (5.00 pushed, 5.00 drawn, p95 5), so the merge saves exactly 3 GL calls a frame. Every other row is the
same within the agents' run-to-run spread.

## Views

`before-N.png` and `after-N.png` are the four poses of
[brief 19's `shot.mjs`](../2026-11-23-hollow-culling/shot.mjs) (the start pose, then three 250 px drags of the
orbit camera). The sim runs on wall time between the two, so agents and the HUD differ; the ground, territory
tiles, houses, hearth and graveyard match, with nothing missing and no seams.

For a pixel comparison, [`still.mjs`](still.mjs) takes one frame at a tick that does not depend on timing: seed
42 started and paused in the same task, then Step pressed 300 times, so both runs show tick 300 in daylight.
[`pixels.mjs`](pixels.mjs) counts the differences:

- **The whole 3D view** (x 380-1280, y 100-800, 630,000 pixels): 1,732 pixels differ by more than one level between
  `still-before.png` and `still-after.png`, against 1,112 between `still-before.png` and a second before run,
  `still-before-rerun.png`. All but 15 lie within 12 px of a pixel that differs between the two before runs: the
  agents (their gait and facing follow the render clock) and the HUD's numbers. Of the 15, 10 are HUD digits and 5
  are single pixels on the edge of a house, where a roof or wall edge now lands on the next pixel. The merged
  vertices are translated on the CPU in double precision and stored as floats, where the GPU used to translate
  float vertices.
- **A territory edge** (x 888-928, y 520-556, two territory tiles in the gold and mauve slots against the grass;
  enlarged in [`crop-before.png`](crop-before.png) and [`crop-after.png`](crop-after.png)): 1 of 1,440 pixels
  differs by more than one level, at the crop's top-left corner on the outline of an agent standing beside the
  tiles. The tiles and their edges do not differ at all: a coloured material under a white tint gives the same
  pixels as a white material under the coloured tint.
- **The hearth** (x 610-670, y 400-445): no pixel differs. The graveyard sits behind a house at this pose; its
  posts and headstones that show do not differ.

Reproduce: `npm run hollow`, then `node still.mjs http://localhost:5175/ <out.png>` and
`node pixels.mjs <a.png> <b.png> <x> <y> <w> <h> [<another run of a>.png]`. `still.mjs` looks for Chromium's
headless shell under `~/.cache/ms-playwright`, as `shot.mjs` does.
