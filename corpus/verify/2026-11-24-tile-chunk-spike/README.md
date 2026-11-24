# Tile-chunk spike (brief 21)

Farm's ground drawn as 32×32-tile chunks from the atlas (`?tilechunks`), against today's baked image. The
outcome is in [the brief](../../briefs/done/21-a-tile-chunk-ground-spike-in-farm.md). Everything here ran
headless on SwiftShader, a CPU rasteriser, so no number here is a GPU time.

## Screenshots

`side-by-side-default.png`, `side-by-side-coast.png` and `side-by-side-widest.png`: today's baked image on
the left, `?tilechunks` on the right. Same seed, run paused about 12 s after Start, camera set through the
client's camera module: the world centre at the default zoom (3), a coast at the default zoom (sand-shore
bands and water speckles), and the widest zoom (0.5, where the whole world is in view).
`side-by-side-coast-4x.png` is a 220×150 crop of the coast, scaled 4×.

The water animates, so it never matches between two shots, and neither do the moving sprites. On land:

| Pose | Pixels identical | Off by 1-2 levels | Off by 32 or more |
|---|---:|---:|---:|
| Default | 89.3% | 7.6% | 2.7% |
| Coast | 70.2% | 26.8% | 2.2% |
| Widest | 81.1% | 11.7% | 6.6% |

The 1-2 level differences are rounding: the bake composites on an 8-bit canvas, the shader in floats. The
large ones are moving sprites, the water seen through the gaps in the bridges, and, at the widest zoom,
single pixels scattered over every island, where nearest sampling at 6-10 world pixels a screen pixel picks
a neighbouring texel. They do not line up with the chunk borders: no seams.

## Counters (`bench/`)

Farm's `?bench` scene at 1280×800. `before*.json` are from the tree before the first edit; `after*.json` are
without the flag on the spike's code; `flag*.json` are with `?tilechunks`. The load average was 1-21
during the runs: other builders shared the machine.

| | Before, 2 runs | After, no flag, 7 runs | `?tilechunks`, 2 runs |
|---|---|---|---|
| `textureBytesTotal` | 61,176,324 | 61,176,324 | 2,193,924 |
| `texturesCreated` | 6 | 6 | 5 |
| GL draw calls a frame, mean / p95 | 93.2-93.4 / 95 | 93.0 / 94 (2 runs); 135.0-135.2 / 136-137 (5 runs) | 108.4 / 158; 149.5 / 200 |
| `drawInstances` p95 | 6,887-6,890 | 6,878-6,958 | 75,134-75,155 |
| Chunk draws a frame, mean / p95 | | | 15.3-16.2 / 64 |
| `render.tileChunks` ms, mean / p95 | | | 0.064 / 0.2; 0.40 / 2.4 at load 21 |
| Frames sampled in 30 s | 178-217 | 269-326 | 40-76 |

- **93 or 135 draw calls without the flag.** The Farmers panel lays its cards out two ways, depending on
  the sim state a run reaches: `no-flag-panel-states.png` shows the end screens of `after-nf6` (93) and
  `after-nf7` (135), the same code without the flag. The wider layout costs about 42 draw calls and 45 UI
  quads a frame. Flagged runs show both states too (`flag2` with 93, `flag1` with 135), and each is 14-15
  draws a frame above its no-flag pair: the chunk draws, less the static layer's one. Why the panel switches
  was not looked for. The totals, `texturesCreated` and `drawGroups` are identical in all nine no-flag runs.
- **Flagged means don't compare with unflagged ones.** SwiftShader draws the chunks so slowly that the
  flagged runs sampled 40-76 frames, not 180-330. The pass's own timer,
  the totals and the p95 counts compare; the means of `frame`, `render.endFrame` and the draw calls don't.
- `extra.tileChunks` in the flagged exports: 64 chunks, 68,222 instances of which 28,379 are decoration
  quads, 1,637,328 bytes of instance buffers, build 34-45 ms, decoration data 46-57 ms.

## Ground build CPU (`bake-cpu/`)

A CPU profile (100 µs samples) from page load to 12 s after Start, two runs a path, load 9-17:

| Inclusive CPU ms | Today | `?tilechunks` |
|---|---:|---:|
| `renderer.bakeStaticLayer` | 767 / 520 | |
| `buildTileChunkDecor` | | 100 / 51 |
| `renderer.bakeTileChunks` | | 164 / 92 |
| `renderer.bakeWaterPattern`, both paths | 408 / 357 | 35 / 15 |

`bakeWaterPattern` makes the first GL upload after the bake, so its extra 350 ms in the baked path is
likely the wait for the 56 MB upload. That was not isolated.

## SwiftShader's frame interval

The debug overlay's `ms` on the paused shots: baked 38-51 ms at the default zoom, 45 on the coast, 78-85 at
the widest; chunks 271-280, 219-236 and 293-378. Four experiments, each reverted, changed nothing:
discarding the decoration quads, a texture-only fragment shader, triangle lists instead of a strip, and
integer instead of float attributes. The cause was not found, and SwiftShader's frame times say nothing
about a GPU: the real-GPU reading decides.

## Redo

With Farm's dev servers up (`npm run dev`):

- `node shot.mjs <prefix> [tilechunks]` shoots the three poses and writes the page's long tasks.
- `node bake-cpu.mjs <out.json> [tilechunks]` writes the CPU profile's totals.
- `node bench-flag.ts <folder> farm [--query=&tilechunks]` is `scripts/bench.ts` with three changes: the
  repo root three folders up, the extra query, and a screenshot of the last frame. It starts and stops its
  own servers, like the original. `agent-browser` needs a writable socket folder; set
  `AGENT_BROWSER_SOCKET_DIR` if the default one isn't.
