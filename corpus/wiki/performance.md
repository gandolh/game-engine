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

### T1.3 WebSocket transport hardening — TODO (queued 2026-06-10, online-research pass)

The split (briefs 57–58) is new and the WS transport has cheap, high-value wins that **don't touch the sim** (render/transport-only → determinism untouched; re-verify with the fast 3-day/3-seed diff anyway). Grounded against the actual code:

- **Server today** ([server/src/index.ts](../../packages/server/src/index.ts)): `new WebSocketServer({ port })` with **no `permessage-deflate`, no `setNoDelay`**. It *does* drop-stale snapshots on `ws.bufferedAmount > 1MB` (correct for a spectator game) and sends `JSON.stringify(msg)`.
- **Client today** ([sim-client/client.ts](../../packages/farm-valley/src/worker/sim-client/client.ts)): renders **one tick (~50ms) behind** latest and lerps prev→current with `smoothstep(alpha)` — this is textbook snapshot interpolation and is *correct*, but a **1-tick buffer tolerates zero dropped snapshots** before it underruns.

TODOs, in impact-for-effort order:

- [x] **Enable `permessage-deflate`** in the `WebSocketServer` options. ✅ **Done 2026-06-10** ([server/src/index.ts](../../packages/server/src/index.ts), `perMessageDeflate: { threshold: 1024 }` — `threshold` skips tiny control frames). ~70–80% size reduction on repetitive JSON at near-zero CPU for 36KB frames. Typecheck clean; transport-only. *Verifying the Caddy WS reverse-proxy passes compression through in prod was **dropped by decision 2026-06-10** (open-questions round) — if the proxy strips it the app still works, just heavier frames.*
- [x] **Bump render delay 1 tick → 2 ticks (~100ms).** ✅ **Done 2026-06-10** (open-questions round): `renderDelayMs` is now `2 * msPerTick` in [client.ts](../../packages/farm-valley/src/worker/sim-client/client.ts), comment updated. Decided intentionally: display latency is irrelevant for a spectator game; absorbing a dropped snapshot + TCP retransmit is not.
- [x] **`setNoDelay(true)` on connection.** ✅ **Done 2026-06-10** ([server/src/index.ts](../../packages/server/src/index.ts) — narrows `ws._socket` since it's absent from the `ws` public types). No-op for today's large JSON frames, but in place ahead of any binary/delta codec (small frames + Nagle + delayed-ACK = ~40ms artificial latency).
- [ ] **Binary/delta wire codec — DEFER** (same gate as T1.1(a) / brief-09 #7). Only if `permessage-deflate` leaves bytes/sec too high at a real concurrent-viewer target. Quantized binary can reach ~4 bytes/entity (~1.2KB vs 36KB). Don't build speculatively.
- [ ] **`visibilitychange` handling (correctness).** rAF pauses when the tab is hidden; on return, the wall-clock `alpha` math can spike / the snapshot buffer can avalanche. Confirmed absent from the client; **briefed 2026-06-10** → [briefs/game/todo/66-visibilitychange-pause-resync.md](../briefs/game/todo/66-visibilitychange-pause-resync.md) (pause + full resync variant).

**Explicitly NOT worth it: WebTransport / WebRTC datagrams.** For a non-competitive *buffered* spectator game, TCP head-of-line blocking is absorbed by the interpolation buffer; WebTransport needs HTTP/3 (not in plain `ws`) + a ~15%-of-users fallback. Premature.

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

## Tier 3 — Perceived smoothness & game feel — TODO (queued 2026-06-10, online-research pass)

Distinct from raw throughput: the engine is far under budget (table below), so the wins here are about how *smooth and polished* it **feels**, not frame time. Canvas2D has ~10× headroom at ~300 sprites — no WebGL/WebGPU needed (a 2025 Phaser case study even found Canvas2D *beating* WebGL on mid hardware). Grounded against the renderer code:

- [ ] **Pixel-snap sprite draws (highest-impact feel fix).** [canvas2d/draw.ts:54,57](../../packages/engine/src/render/canvas2d/draw.ts#L54) draws at raw sub-pixel `s.x`/`s.y` straight from interpolation — the #1 cause of shimmer on slow-moving 16×16 pixel-art sprites. Snap **only at draw time** (`(s.x - cam.x) | 0`), never in stored/interpolated state. (`imageSmoothingEnabled=false` is already re-asserted per frame at [renderer.ts:271](../../packages/engine/src/render/canvas2d/renderer.ts#L271) — keep that; it's the correct defensive pattern, the setting is part of saved canvas state.)
- [ ] **Camera smoothing.** [main/camera.ts](../../packages/farm-valley/src/main/camera.ts) calls `setCenter()` to **snap directly** to the focused farmer each frame (only the pan-offset glide-back is eased). A documentary-style spectator camera should *lag* its target. Add framerate-independent exponential smoothing / a critically-damped spring, `halflife ≈ 0.3–0.5s` for a cozy floaty feel: `cam.x += (target.x - cam.x) * (1 - Math.exp(-Math.LN2 / halflife * dt))`. Single highest-leverage "polish" change.
- [ ] **Floating number popups** ("+12 gold") on sells/harvests — easeOutCubic rise + fade. 100% render-side off the existing event feed (sim already emits the events). Cheap, big readability win for a spectator economy game.
- [ ] **Juice beats (Vlambeer / "Juice It or Lose It"):** trauma-based screen shake (`shake = trauma²`, decaying, *tiny* 2–4px, positive beats only — lead crossing, festival win, lobster catch); 2–4 frame **hitstop** on a major event; score-bump (scale 1.0→1.3→1.0 easeOutBack) when a leaderboard number rises.
- [ ] **Ambient idle life:** sine-based crop sway / tree-canopy drift / farmer breathing-bob. Pure render, never feeds the sim — for an idle/spectator game this *is* the main source of life between economic events.

All Tier 3 items are render-only and seed-deterministic by construction (like the day/night wash and ground-noise texture before them) — but still re-verify with the fast determinism diff. These are **game-feel briefs**, not perf briefs; route through the normal brief/wiki workflow.

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
5. ~~**T1.3 WebSocket transport quick-wins**~~ — ✅ **mostly done 2026-06-10**: `permessage-deflate` + `setNoDelay` + render-delay 1→2 ticks shipped; `visibilitychange` briefed ([game/todo/66](../briefs/game/todo/66-visibilitychange-pause-resync.md)); Caddy compression verification dropped by decision.
6. **Tier 3 game-feel** (queued 2026-06-10) — pixel-snap + camera smoothing briefed ([game/todo/67](../briefs/game/todo/67-pixel-snap-and-camera-smoothing.md)), ambient idle life briefed ([game/todo/68](../briefs/game/todo/68-ambient-idle-life.md)); number popups + juice deferred until those land. Game-feel briefs, not perf.

> **The AI-drama gap is the bigger product lever, but it is NOT a perf item.** Online research (2026-06-10) confirmed the leader-runaway flatness is a well-studied design failure mode (positive-feedback snowball + personality convergence + no cross-agent reaction), fixed by negative-feedback economics (market saturation), hard personality niche-exclusions, and a social-awareness belief layer + persistent "social-practice" trade landmarks. That work is tracked in [open-questions.md](open-questions.md) and [briefs/game/todo/59-peer-interaction-and-rubber-banding.md](../briefs/game/todo/59-peer-interaction-and-rubber-banding.md) — not here.

## Sources

External best-practice references consulted (2026-06-05):
- [surma.dev — Is postMessage slow?](https://surma.dev/things/is-postmessage-slow/) · [Chrome — Transferable objects](https://developer.chrome.com/blog/transferable-objects-lightning-fast) · [MDN — SharedArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)
- [web.dev — Static memory with object pools](https://web.dev/articles/speed-static-mem-pools) · [MDN — Optimizing canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas) · [Konva — Canvas perf tips](https://konvajs.org/docs/performance/All_Performance_Tips.html)
- [ecs-faq (Sander Mertens)](https://github.com/SanderMertens/ecs-faq) · [ECS deep dive](https://www.numberanalytics.com/blog/ecs-in-game-development-deep-dive)

WS netcode + render-feel references consulted (2026-06-10, online-research pass — Tiers 1.3 & 3):
- [Gambetta — Entity Interpolation](https://www.gabrielgambetta.com/entity-interpolation.html) · [Gaffer on Games — Snapshot Interpolation](https://gafferongames.com/post/snapshot_interpolation/) · [Valve — Source Multiplayer Networking](https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking) (the `cl_interp` 100ms default)
- [Marc Brooker — It's always TCP_NODELAY](https://brooker.co.za/blog/2024/05/09/nagle.html) · [Ably — Can WebTransport replace WebSockets?](https://ably.com/blog/can-webtransport-replace-websockets) · [MDN — WebSocket.bufferedAmount](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/bufferedAmount)
- [Gaffer on Games — Fix Your Timestep!](https://gafferongames.com/post/fix_your_timestep/) · [marioslab.io — Jitterbugs (sub-pixel jitter)](https://marioslab.io/posts/jitterbugs/) · [theorangeduck.com — Spring-Roll-Call (camera springs)](https://theorangeduck.com/page/spring-roll-call)
- [Jonasson & Purho — Juice It or Lose It (GDC)](https://www.youtube.com/watch?v=Fy0aCDmgnxg) · [Vlambeer — The Art of Screenshake](https://www.youtube.com/watch?v=AJdEqssNZ-U) · [web.dev — Avoid layout thrashing](https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing)
- ECS/BDI at small scale (reconfirmed "NOT worth doing"): [Run-time perf: sparse-set vs archetype (Eurographics)](https://diglib.eg.org/bitstreams/766b72a4-70ae-4e8e-935b-949d589ed962/download) (10k-entity crossover) · [Concurrency in the ECS pattern (arXiv 2508.15264)](https://arxiv.org/pdf/2508.15264) · [Runaway leader / rubber banding (Oakleaf Games)](https://oakleafgames.wordpress.com/2014/02/13/game-theory-runaway-leader-rubber-banding-and-feedback/) · [Behavioral diversity in MARL (arXiv 2412.16244)](https://arxiv.org/pdf/2412.16244)
