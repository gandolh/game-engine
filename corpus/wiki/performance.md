# Performance & Optimization

Optimization opportunities for the engine, filtered against what the code **actually does** (verified 2026-06-05). Ordered by impact-for-effort. Generic "best practice" advice that doesn't apply at Farm Valley's scale (~4 farmers + tens of entities) is explicitly called out so it isn't re-litigated.

> **Determinism guardrail.** Any of these is a refactor of *how* state moves, never *what* it computes. Prove behavior-preservation with multi-seed `EXPORT=json` diffs, not just `CHECK_DETERMINISM=1` (which only proves reproducibility). See [architecture.md](architecture.md) and the root [CLAUDE.md](../../CLAUDE.md).

## Already done — do not redo

- **Query iteration is pooled.** `for...of` over a query borrows a scratch buffer and returns it; steady-state iteration allocates zero arrays — [world.ts:65-97](../../packages/engine/src/ecs/world.ts#L65-L97).
- **Static layer + water pattern baked once** to OffscreenCanvas, blitted with one `drawImage`/`fillRect` per frame — [canvas2d/renderer.ts](../../packages/engine/src/render/canvas2d/renderer.ts). This is the textbook "layer caching" win, already shipped (brief 07).
- **Message bus uses buffer-swap** (`inflight`↔`deliverable`) instead of reallocating — [message-bus.ts](../../packages/engine/src/sim/message-bus.ts).
- **Coastline foam bubbles are viewport-culled** — [main/render-loop.ts](../../packages/farm-valley/src/main/render-loop.ts). (The *only* culling currently in the renderer — see Tier 2.)

## Tier 1 — Highest impact

### T1.1 The sim→render snapshot boundary
> **Boundary changed (briefs 57–58, 2026-06-10).** The sim no longer runs in an in-browser Web Worker over `postMessage`/structured-clone — it runs in the Node server (`@farm/server`, [sim-host.ts](../../packages/server/src/sim-host.ts)) and ships each `RenderSnapshot` to the browser as **`JSON.stringify` over a WebSocket**. So the cost is now JSON serialization + network framing, not structured clone, and the `SharedArrayBuffer`/transfer ideas below **no longer apply** (there's no shared address space across a socket). This whole tier should be re-measured against the new transport before any work.

Each server tick builds 6–8 fresh arrays (~150–200 object allocations) and `JSON.stringify`s them onto the socket — [snapshot-builder/](../../packages/sim-core/src/snapshot-builder/). The server already measures payload size (`snapshot.bytes`) and has drop-stale backpressure.

- **(a) ~~Bigger win~~ — obsoleted by the split.** The old plan (pack numeric sprite data into a `Float32Array` ring + `postMessage(buf, [buf])` transfer or `SharedArrayBuffer`) assumed a same-process Worker. Over a WebSocket the equivalent would be a **binary wire codec** (e.g. a typed-array frame for the hot sprite fields + JSON for the rare payload) — but only if profiling shows JSON encode + bytes/sec is material at 20 Hz. Measure first; for ~25 sprites/tick it's likely negligible.
- **(b) Cheaper interim win (still valid):** stop double-allocating the events array (`.slice().map()` → single loop into a reused buffer), and rebuild the observer/leaderboard payload only on **day boundaries**, not every tick — that state barely changes tick-to-tick. This reduces both allocation and JSON size regardless of transport.

### T1.2 Per-frame interpolation allocates on the render thread
`getInterpolatedSprites()` runs every *frame* (~60fps, not per tick): `new Map()` of prev-sprites, `.map()` a fresh array, spread `{...s}` per sprite — [sim-client/client.ts](../../packages/farm-valley/src/worker/sim-client/client.ts), [main/render-loop.ts](../../packages/farm-valley/src/main/render-loop.ts). Classic GC-churn.

- Pool the interpolated sprite array + objects; mutate in place across frames.
- Index prev-sprites by id once when the snapshot arrives, not every frame.
- If sprite IDs are dense, replace the `Map` with a plain indexed array.

## Tier 2 — Culling & clipping (classic strategies, currently mostly absent)

The static backdrop is **blitted full-frame with no clipping** even when zoomed in — the entire 88×80 baked canvas is drawn every frame regardless of how little is on screen ([canvas2d/renderer.ts](../../packages/engine/src/render/canvas2d/renderer.ts)). Dynamic sprites and shadows are **not viewport-culled** ([canvas2d/renderer.ts](../../packages/engine/src/render/canvas2d/renderer.ts)); only foam bubbles are. So the classic 2D wins are real here:

- **Viewport culling of dynamic sprites/shadows.** Skip `push`/`drawSprite` for anything whose bounds fall outside `[viewLeft,viewRight]×[viewTop,viewBottom]` — the same test already used for foam in [main/render-loop.ts](../../packages/farm-valley/src/main/render-loop.ts). Cheap, and grows in value as entity count / world size grows.
- **Clip the static-layer blit to the visible source rect.** `drawImage(staticLayer, sx,sy,sw,sh, dx,dy,dw,dh)` using only the camera-visible region instead of the whole baked canvas. Saves fill work when zoomed in.
- **`ctx.clip()` / dirty-rectangle redraw.** Lower priority — the wash + full sprite repaint each frame make a true dirty-rect scheme awkward, but a clip region around the camera viewport prevents overdraw outside it.
- **Sort only when the set changes.** `this.queue.sort(compareSprite)` runs every frame ([canvas2d/renderer.ts](../../packages/engine/src/render/canvas2d/renderer.ts)); z-order rarely changes frame-to-frame. Bucket by layer or sort-on-dirty.

## Tier 2b — Loose per-tick allocations in systems

Small individually, all in the hot path, trivial to fix (the `length = 0` reuse pattern already lives in [feature-collision.ts](../../packages/sim-core/src/systems/feature-collision.ts)):

- [crop-growth.ts:55](../../packages/sim-core/src/systems/crop-growth.ts#L55) — `[...world.query("plot")]` spreads a fresh array just to sort it. Reuse a persistent scratch array, sort in place.
- [event-feed/system.ts](../../packages/sim-core/src/systems/event-feed/system.ts) — `const fresh = []` every tick. Reuse a member buffer.
- Render queue: `this.queue = []` each frame ([canvas2d/renderer.ts](../../packages/engine/src/render/canvas2d/renderer.ts)) → reuse with `length = 0`.

## Explicitly NOT worth doing at current scale

- **Archetype / SoA / column-oriented ECS storage.** The ECS uses flat objects with property-based components ([world.ts:12-23](../../packages/engine/src/ecs/world.ts#L12-L23)). The literature's 5–10× cache-locality wins materialize at thousands–millions of entities in tight numeric loops; Farm Valley has ~4 farmers + tens of entities. A rewrite would be high-effort, near-zero-payoff, and would fight the determinism guarantees. **Confirmed by profiling 2026-06-05:** the full sim tick over ~300 entities is **0.33ms (~0.7% of the 50ms budget)** — there is no cache-locality problem to solve. Revisit **only** if entity counts grow by orders of magnitude.
- **Path caching beyond current behavior.** The pathfinder is only called on a *new* travel intent with no active path ([travel/system.ts](../../packages/sim-core/src/systems/travel/system.ts)); it is not a per-tick cost. Profiling shows the whole tick (pathfinder included on travel ticks) is sub-millisecond. Not worth caching.
- **Packed/SharedArrayBuffer snapshot (P2 #7).** Profiling (when this was a Web Worker) showed `snapshot.build` = 0.08ms and ~36KB/tick — invisible in the tick/frame budget. The packed-buffer/SAB rewrite would add real complexity for an unmeasurable gain. **Doubly moot since the split** (briefs 57–58): the boundary is now JSON over a WebSocket, not structured clone, so SAB doesn't even apply — see the T1.1 note above. Deferred indefinitely; revisit only if `snapshot.bytes` or the server tick climb materially (e.g. a 10× entity-count increase), and then via a binary wire codec, not SAB.

## Measuring (P0 — shipped 2026-06-05)

A `Profiler` ([profiler.ts](../../packages/engine/src/debug/profiler.ts), exported from `@engine/core`) is wired into the worker and render loop. Append `?profile` to the URL to turn it on; the [DebugOverlay](../../packages/engine/src/debug/overlay.ts) then shows mean/p95 for:
- `tick` — `scheduler.tick` (worker)
- `snapshot.build` / `snapshot.bytes` — snapshot construction + payload size (worker; the T1.1 baseline)
- `interp` — `getInterpolatedSprites` (main; the T1.2 baseline)
- `frame` — whole render-frame body (main)

Off by default (zero overhead). Diagnostic only — measures host timing, never sim state. Use these numbers as the before/after baseline for every task below. Tracked in [briefs/engine/todo/09-perf-optimization.md](../briefs/engine/todo/09-perf-optimization.md).

### Measured results (2026-06-05, seed 0xc0ffee, post-P1/P2, ~250–300 entities)

| Metric | mean | p95 | budget | utilization |
|---|---|---|---|---|
| `tick` (sim) | 0.33–0.37 ms | 0.50–0.70 ms | 50 ms (20Hz) | **~0.7%** |
| `snapshot.build` | 0.08–0.09 ms | 0.20 ms | — | negligible |
| `snapshot.bytes` | ~36 KB/tick (~720 KB/s) | — | — | sub-ms clone |
| `frame` (render) | 1.36–1.69 ms | 2.0–2.3 ms | 16.6 ms (60fps) | **~10%** |
| `interp` | 0.03–0.04 ms | 0.10 ms | — | negligible |
| fps | ~60 | — | vsync | not a self-imposed cap |

**Conclusion: the engine is far under budget everywhere.** 60fps is browser vsync (rAF), not a limiter we set — the render frame uses only ~10% of its 16.6ms budget and the sim tick ~0.7% of its 50ms. These numbers **settle the two gated items**: #7 (packed/SAB snapshot) and P3 (archetype ECS) both chase costs that don't exist at this scale — see "Explicitly NOT worth doing" below.

## Suggested order of attack

1. ~~**Profile first**~~ — ✅ done (see "Measuring" above).
2. ~~T1.2 interpolation pooling + T2b loose allocations + Tier 2 viewport culling/clipping~~ — ✅ **done 2026-06-05** (brief 09 P1; behavior-preserving, multi-seed `EXPORT=json` byte-identical). Sort-on-dirty was partially deferred (live set is tiny after culling). Details: [briefs/engine/todo/09-perf-optimization.md](../briefs/engine/todo/09-perf-optimization.md).
3. ~~T1.1(b) snapshot interim win~~ — ✅ **done 2026-06-05** (events double-alloc removed). The brief's "cache observer/leaderboard per day" half was **dropped as incorrect**: that state changes intra-day (gold/FSM/AP/intention update on arbitrary ticks), so caching it would freeze the live panels.
4. T1.1(a) SharedArrayBuffer/transfer boundary — **deferred, gated on profiling**. Build only if `?profile` shows `snapshot.bytes`/copy time is material; expected negligible at ~25 sprites/tick. Prefer transferable buffers over SAB (no COOP/COEP needed). See [briefs/engine/todo/09-perf-optimization.md](../briefs/engine/todo/09-perf-optimization.md) #7.

## Sources

External best-practice references consulted (2026-06-05):
- [surma.dev — Is postMessage slow?](https://surma.dev/things/is-postmessage-slow/) · [Chrome — Transferable objects](https://developer.chrome.com/blog/transferable-objects-lightning-fast) · [MDN — SharedArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)
- [web.dev — Static memory with object pools](https://web.dev/articles/speed-static-mem-pools) · [MDN — Optimizing canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas) · [Konva — Canvas perf tips](https://konvajs.org/docs/performance/All_Performance_Tips.html)
- [ecs-faq (Sander Mertens)](https://github.com/SanderMertens/ecs-faq) · [ECS deep dive](https://www.numberanalytics.com/blog/ecs-in-game-development-deep-dive)
