# Per-frame allocations (brief 20)

Brief 20 profiled the heap bytes allocated per frame in Farm and MateQuest over the `?bench` scene, then
removed the top sites. Commits: `90ee9b84` (engine renderer and UI, Farm's render pushes) and the MateQuest
map-screen commit after it.

## Tools

`heap.mjs <url> <out.json>` takes a sampling heap profile (all allocations, including ones already collected)
in headless Chromium over the DevTools protocol. Sampling starts 3 s into the warm-up, and the total is
divided by `displayTicks`. It needs the game's dev server (Farm also `npm run server`). The bench's own
`heap.drops` counts collections and is the second measure.

## Files

| File | What |
|---|---|
| `farm-before-heap.json`, `farm-after-fair-heap.json` | Farm profile before and after, about 325 frames each |
| `farm-after-heap.json` | Farm after again, taken at machine load average 42: 103 frames, see the caveat |
| `mq-before-heap.json`, `mq-before-rerun-heap.json` | MateQuest before, two runs with different screen mixes |
| `mq-after-first-pass-heap.json`, `mq-after-heap.json` | MateQuest after the first pass and after the map screen fix |
| `farm-bench-before.json`, `farm-bench-before-rerun.json`, `farm-bench-after.json` | `npm run bench` for Farm |
| `mq-bench-before.json`, `mq-bench-after.json` | `npm run bench` for MateQuest |

## Farm (bytes per frame, ranked)

| Before (2.75 MB, 323 frames) | After (1.54 MB, 325 frames, -44%) |
|---|---|
| 403 K `pushBridgeSprites` | 310 K `SimClient.ws.onmessage` (JSON decode, wire format, not touched) |
| 332 K `_packSprite` | 141 K `pushBridgeSprites` |
| 309 K `SimClient.ws.onmessage` | 135 K `pushSnapshotSprites` |
| 245 K `drawLabel` | 94 K `_packSprite` |
| 195 K ui-quad-pass `pack` iterator | 86 K `drawNode` |
| 140 K `pushSnapshotSprites` | 69 K `arrange` |
| 133 K `wrapParagraph` | 65 K `detectCrossings` (wealth graph) |

Without the wire decode the rest fell from 2.44 MB to 1.23 MB (-50%). The run at load 42 shows 2.98 MB, but
only 103 frames fit in the window while messages keep arriving by time, so `ws.onmessage` alone is 1.29 MB a
frame there; the other sites match the fair run (`pushSnapshotSprites` 156 K, `pushBridgeSprites` 143 K).

## MateQuest (bytes per frame, ranked)

The scene loops map, combat and loot, and how many frames of each land in the window depends on machine speed:

| Run | Mix (display ticks) | Bytes a frame |
|---|---|---|
| before | map 60, combat 300, loot 30 | 854 K |
| before, rerun | map 30, combat 150 | 1,258 K |
| after, first pass | map 60, combat 210, loot 30 | 203 K |
| after, map screen fixed | map 30, combat 30 | 424 K |

A map frame costs far more than a combat frame (up to 20,000 UI quads against a few thousand), so the byte
rate follows the map share. Compare by map-screen sites and the map-heavy runs:

- Before, rerun (30 map frames): `rect` in map-screen 219 K, ui-surface `rect` 226 K, `pack` 256 K,
  `drawTriangle` 89 K, `drawRoad` 74 K, map `rect` 52 K, `outlineDraw` 32 K, `render` 26 K a frame.
- After, map fixed (30 map frames): `drawTriangle` 161 K, `render` 58 K, `drawRoad` 49 K, `drawProp` 19 K,
  `drawPine` 14 K. The pack, ui-surface and outline-closure sites are gone from the top.

The same 30 map frames cost 3.0 MB each in map-screen sites before and about 0.6 MB after (about -80%). What
is left in `drawTriangle`, `drawRoad` and `render` is the boxing of floating-point arguments across calls that
V8 does not inline, about 10,000 rects a map frame; fewer rects (batching a run of rows into one quad) is the
next step, and changes what is drawn, so it is not this brief.

## Bench counters (headless, SwiftShader)

| | draw groups | UI quads (mean) | GL draw calls (mean) | heap drops |
|---|---|---|---|---|
| Farm before | 1 | 1,821 | 135 | 15 |
| Farm before, rerun at the load of the after run | 1 | 1,778 | 93.6 | 15 |
| Farm after | 1 | 1,778 | 93.6 | 8 (one earlier run: 5) |
| MateQuest before (270 frames, mixed) | 0 | p95 20,583 | p95 47 | 12 |
| MateQuest after (30 frames, all map) | 0 | p95 20,583 | p95 32 | 10 in 30 frames |

The first Farm "before" differs from the other three only because it ran at a different machine load (a
different point of the scene when the window opens); the rerun on the old code matches the after numbers
exactly. MateQuest's per-frame quad counts match on the map screen (the p95 is the map frame, 20,583 in
both); a whole-scene mean needs the same mix, which a loaded machine does not give.

## Left for later

- Farm `SimClient.ws.onmessage`: 310 KB a frame of JSON decode. It is the wire format.
- Farm `pushSnapshotSprites`: builds a sprite object per entity per frame (about 135 KB); the renderer keeps
  each pushed sprite until the frame ends, so pooling needs the same pool-and-reset scheme as the UI quads.
- Wealth graph `detectCrossings`: Map and Set per frame (about 65 KB).
- MateQuest map screen: one quad per row of every triangle; batching rows would cut the rect count.
