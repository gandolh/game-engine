# Hollow frustum culling: before and after (brief 19)

`before-N.png` and `after-N.png` are Hollow at 1280x800, seed 42, headless Chromium with SwiftShader (so
frame times in the HUD mean nothing). `shot.mjs` takes them: it starts the town, takes shot 0 at the default
camera, then drags the orbit camera 250 px before each of shots 1 to 3, so both runs frame the same views.
The bench's own orbit runs on wall time, so it can't be stopped at a fixed moment without a hook in the game;
the drag gives the same views without one.

The town keeps simulating between the two runs, so agents, the day/night wash and the HUD numbers differ.
Compare the static things: the ground's outline, the houses and the trees at the frame's edges. They match;
nothing is missing or popping.

Bench numbers (`npm run bench -- <folder> hollow`, seed 42, 1280x800, orbit scene, load average about 20):

| | before | after |
| --- | --- | --- |
| `drawInstances` mean / p95 | 98.46 / 109 | 95.63 / 107 |
| `glDrawCalls` mean / p95 | 35.40 / 41 | 35.57 / 41 |
| `frame` timer mean (CPU ms) | 1.51 | 1.77 |

Instance counts do not depend on load; the `frame` timer does, so read it as noise. The town fills most of the
frame at the bench camera, so little is off screen and the saving is small.
Reproduce: start `npm run hollow`, then `node shot.mjs http://localhost:5175/ <prefix>`.
