# Performance & Optimization

Optimization opportunities for the engine, filtered against what the code **actually does** (verified 2026-06-05). Ordered by impact-for-effort. Generic "best practice" advice that doesn't apply at Farm Valley's scale (~4 farmers + tens of entities) is explicitly called out so it isn't re-litigated.

> **Determinism guardrail.** Any of these is a refactor of *how* state moves, never *what* it computes. Prove behavior-preservation with multi-seed `EXPORT=json` diffs, not just `CHECK_DETERMINISM=1` (which only proves reproducibility). See [architecture.md](architecture.md) and the root [CLAUDE.md](../../CLAUDE.md).

## Tier 0 — Live FPS regression: 15–30 fps (should be 60) — reported 2026-06-11; **PROFILED (hypothesis overturned)**

> **➡️ The measured truth is in the [PROFILED 2026-06-11](#-profiled-2026-06-11--hypothesis-overturned-the-bottleneck-is-canvas-raster-not-domparticles) subsection below — read it first.** The bottleneck is **canvas raster, not DOM/particles**. The ranked suspect list below is kept only because the verdicts reference it by number (#1–#5); treat it as "what we suspected," not fact.

> **Pre-profile reasoning (superseded).** The 2026-06-05/06-10 "Measured results" tables show ~60 fps at ~6–10 ms/frame, so 15–30 fps meant a regression after those — suspected the render-side features that landed since (camera smoothing 67, ambient 68, weather particles 74, tab-resync 66); the world is now 160-wide with 21 farmers. All transport/render-only.

Ranked by likelihood × impact-for-effort (each names the file:line so it can be confirmed):

- [ ] **0. Re-profile first (gates everything else).** Run `npm run dev` + `?profile` ([config.ts](../../packages/farm-valley/src/main/config.ts) `PROFILE_ENABLED`); the [DebugOverlay](../../packages/engine/src/debug/overlay.ts) shows `frame` / `interp` mean+p95. Confirm `frame` ≫ 16.6 ms and identify whether the cost is DOM (panels), particles, or canvas draw. **Per the resource rule, ask the user before any longer perf probe.** Capture the before/after number for each fix.

- [ ] **1. Relationship matrix rebuilds 441 DOM cells EVERY frame (top suspect).** [relationship-matrix.ts:92](../../packages/farm-valley/src/ui/relationship-matrix.ts#L92) has **no dirty guard** — `update()` rebuilds the full 21×21 `<table>` (`createEl` + `applyStyles` per cell, then `replaceChildren`) on every render frame (~60 Hz), though trust changes at most per-tick (20 Hz) and usually per-day. That's ~28k element creations/sec + full-table relayout. Contrast the panels that already gate: wealth-graph (`lastDayDrawn` guard, [panel.ts:79](../../packages/farm-valley/src/ui/wealth-graph/panel.ts#L79)), observer (row reuse), event-feed (node reuse). **Fix:** cache a trust signature (or gate on `client.tick` change) and early-return when unchanged; ideally reuse cells like the other panels. Highest-leverage single change.

- [ ] **2. Unbounded weather-particle spawning (brief 74, new).** [render-loop.ts:279-319](../../packages/farm-valley/src/main/render-loop.ts#L279-L319) spawns `(viewWidth/TILE) × 2.2` rain rects (or `× 0.9` snow) **every frame** — at the wide default-zoom viewport (whole 160-tile world) that's a few hundred particles/frame during a storm, with no pool cap. Compounded by [particles.ts:93](../../packages/engine/src/render/particles.ts#L93) using `splice(i,1)` (O(n) shift per dead particle → O(n²)-ish churn) and a per-particle `arc()`/`fillRect()` draw. **Fix:** cap total particle count, budget spawns/frame, and swap-with-last + `pop()` instead of `splice`.

- [ ] **3. Gate the whole panel-update block on tick change.** [render-loop.ts:419-431](../../packages/farm-valley/src/main/render-loop.ts#L419-L431) calls all 9 panel `update()`s every frame though their data changes at ≤20 Hz. Even with per-panel guards this re-reads client state 60×/s. Wrap the block in `if (client.tick !== lastPanelTick)`. Cheap, removes a class of future regressions.

- [ ] **4. Tier 2 culling now actually bites (was deferred when world was small).** Dynamic sprites/shadows are still **not viewport-culled** and `this.queue.sort(compareSprite)` runs **every frame** ([canvas2d/renderer.ts](../../packages/engine/src/render/canvas2d/renderer.ts)); the static layer is blitted full-frame. With the 160-wide world + 21 farmers + ambient + always-on animated pushes (foam culled, but forge fire/smoke/waterfall/campfire/beacon at [render-loop.ts:167-246](../../packages/farm-valley/src/main/render-loop.ts#L167-L246) are not), the deferred Tier 2 wins below are worth taking now: cull dynamic sprites to `[viewLeft,viewRight]×[viewTop,viewBottom]`, clip the static blit to the visible source rect, and sort-on-dirty.

- [ ] **5. Ambient layer cost (brief 68).** `ambient.update` + `ambient.pushSprites` run every frame ([render-loop.ts:413-414](../../packages/farm-valley/src/main/render-loop.ts#L413-L414)). New since baseline; profile its sprite count and confirm it's culled to `view` (it's passed `view` — verify it uses it).

**Likely root cause (pre-profile hypothesis):** #1 (DOM thrash, constant cost regardless of weather) + #2 (particle storm, intermittent) together. #1 explains a steady 30 fps; #2 explains drops to 15 during rain/storm/winter. Profile to confirm before committing effort.

### ✅ PROFILED 2026-06-11 — hypothesis overturned: the bottleneck is canvas raster, not DOM/particles

Profiled live via Playwright `?profile` (seed `0xc0ffee`, `#c0ffee-64-3c` → `ticksPerDay=60` so weather cycles fast; render loop still runs at 60 Hz). Added dev-only sub-timers in [render-loop.ts](../../packages/farm-valley/src/main/render-loop.ts) (`weather.spawn`, `particles.update`, `pushSprites`, `ambient`, `render.endFrame`, `panels`, `panels.relmatrix`) gated by `PROFILE_ENABLED` (wall-clock, zero sim/determinism impact) + exposed `window.__frameProfile()` for a structured readout.

> ⚠️ **Environment caveat.** Measured in **headless Chromium (WSL2, DPR 1, canvas 1428×590)**, which rasters the canvas on **SwiftShader (CPU)** — far slower at raster than a real GPU. So the *absolute* fps here is pessimistic; trust the **relative attribution**, and re-read `frame`/fps on a real-GPU browser (see "what the user should check").

**Measured (mean / p95, ~640-frame window):**

| metric | before fix | after relmatrix fix |
|---|---|---|
| bare `requestAnimationFrame` loop | **60.6 fps** (16.5 ms, steady) — vsync is healthy, not throttled | — |
| game **true render fps** (frame-count / wall) | **40.7 fps** | **~40 fps (unchanged)** |
| JS `frame` work | 7.1–7.8 / ~10–12 ms | 4–7 / 7–12 ms |
| `panels` (all 9) | **3.28 ms** | **0.28 ms** |
| ↳ `panels.relmatrix` | **~3.2 ms** (38% of the JS frame) | **0.015 ms** |
| `render.endFrame` (canvas draw JS) | 2.5–3.3 ms | 2.4–3.6 ms |
| `pushSprites` / `ambient` / `weather.spawn` / `interp` | 0.27 / 0.01 / 0.01 / 0.09 ms | same |
| `particles.update` | ~0 (no storm landed; rain only) | ~0 |

**What this means.** A do-nothing rAF hits a rock-steady 60 fps, but the game renders ~40 fps while doing only **~5–7 ms of JS per frame** — well under the 16.7 ms budget. The missing ~10 ms is **canvas raster + composite that runs *after* the JS callback** and is invisible to the JS profiler; when total (JS + raster) spills past a vsync, the browser halves to 30 fps, so the average bounces 60↔30 ≈ 40. At the **default zoom the camera spans the whole 160-tile (2560 px) world** ([config.ts](../../packages/farm-valley/src/main/config.ts) `worldUnitsX = WORLD_WIDTH*TILE`, `sx≈0.56` → zoomed *out*), so the viewport cull in [renderer.ts](../../packages/engine/src/render/canvas2d/renderer.ts#L177) `push()` drops nothing and every frame rasters the full static-layer blit + a **bilinear** water-pattern fill (two passes, `sx<1`) + ~470 sprites.

**Verdicts on the ranked suspects:**
- **#1 relationship matrix — REAL waste, FIXED, but not the headless straw.** Rebuilt 441 DOM cells every frame = ~3.2 ms JS (38% of the frame) + per-frame table reflow. Shipped a signature-based dirty guard ([relationship-matrix.ts](../../packages/farm-valley/src/ui/relationship-matrix.ts) `computeSignature`/`lastSignature`, mirrors wealth-graph's `lastDayDrawn`) → 3.2 ms → 0.015 ms, `panels` 3.28 → 0.28 ms. **But true fps did not move** (headless is raster-bound, which masks DOM-paint savings). On a real GPU where raster is cheap, this DOM cost is a plausible *actual* straw — so the fix is worth shipping regardless and the user should re-check fps with it in.
- **#2 weather particles — NOT the bottleneck (as far as observed).** Could not land a storm in the probe window (spring drew sunny/normal/rainy); `particles.update` stayed ~0 and `weather.spawn` ~0.01 ms; fps unchanged across dry→rainy. The code issues (uncapped spawn, O(n) `splice` removal) are real but did not bite at observed levels — deferred, not shipped.
- **#3 gate panels on tick — moot.** Per-panel guards (now incl. relmatrix) already make the whole `panels` block 0.28 ms; no need to gate the block.
- **#4 dynamic-sprite culling / sort-on-dirty — this is where the real lever is.** Confirmed culling is a no-op at default zoom (whole world in view). The reducible raster cost is the full-world static blit, the two-pass bilinear water fill, and the per-frame whole-queue `compareSprite` sort. **Untouched** — these are bigger changes and headless SwiftShader can't validate them faithfully; needs a real-GPU before/after.
- **#5 ambient — negligible** (0.01 ms JS; its raster is folded into the whole-world cost).

**Shipped this round:** suspect #1 dirty guard only (safe, correct, zero-risk JS/DOM win). Step 0's dev-only sub-timers + `window.__frameProfile` are kept (gated by `?profile`; the overlay still only prints `frame`/`interp`, so use `window.__frameProfile()` for the full breakdown).

**What the user should check (real GPU, disambiguates the remaining cost):** open the live game with `?profile`, read the overlay `fps` and `frame` mean/p95 with the relmatrix fix in. If `frame` JS is ~5–7 ms but fps is still 15–30 → it's GPU raster (do #4: clamp default zoom / cull / clip the static blit / sort-on-dirty / drop the second water pass at zoom-out). If `frame` JS is now ≥16 ms → a JS path regressed and we re-profile that. Capture before/after per fix.

## Already done — do not redo

- **Query iteration is pooled.** `for...of` over a query borrows a scratch buffer and returns it; steady-state iteration allocates zero arrays — [world.ts:65-97](../../packages/engine/src/ecs/world.ts#L65-L97).
- **Static layer + water pattern baked once** to OffscreenCanvas, blitted with one `drawImage`/`fillRect` per frame — [canvas2d/renderer.ts](../../packages/engine/src/render/canvas2d/renderer.ts). This is the textbook "layer caching" win, already shipped (brief 07).
- **Message bus uses buffer-swap** (`inflight`↔`deliverable`) instead of reallocating — [message-bus.ts](../../packages/engine/src/sim/message-bus.ts).
- **Coastline foam bubbles are viewport-culled** — [main/render-loop.ts](../../packages/farm-valley/src/main/render-loop.ts). (The *only* culling currently in the renderer — see Tier 2.)
- **Test-suite runtime tuned (2026-06-10).** sim-core runs with `pool: "threads"` + `isolate: false` ([vitest.config.ts](../../packages/sim-core/vitest.config.ts) — module-state safety rationale in the file; verified green under shuffled file order), and the three heaviest live-sim test files (coral-fishing, orchard, tile-features) each drive ONE shared deterministic run in `beforeAll` and latch per-milestone observations instead of booting near-identical sims per spec. Full suite ~66s → ~45s wall; sim-core 54s → ~25s solo. Don't re-split the shared runs or re-enable per-file isolation without re-measuring; the floor is now coral-fishing's single ~12k-tick JsPathfinder run (~24s).

## Tier 1 — Highest impact

### T1.1 The sim→render snapshot boundary
> **Boundary changed (briefs 57–58, 2026-06-10).** The sim no longer runs in an in-browser Web Worker over `postMessage`/structured-clone — it runs in the Node server (`@farm/server`, [sim-host.ts](../../packages/server/src/sim-host.ts)) and ships each `RenderSnapshot` to the browser as **`JSON.stringify` over a WebSocket**. So the cost is now JSON serialization + network framing, not structured clone, and the `SharedArrayBuffer`/transfer ideas below **no longer apply** (there's no shared address space across a socket).

> **Re-measured 2026-06-10** (post 21-farmer radial reorg + 40→52 world widening) with [probe-snapshot-size.ts](../../tools/run-sim/src/probe-snapshot-size.ts), seed `0xc0ffee`, day 19: **the snapshot is now ~143 KB/tick raw JSON — 4× the 36 KB the old table below records.** At 20 Hz that is ~2.8 MB/s of stringify (+ permessage-deflate) **per viewer** (one SimHost per WebSocket). Composition:
>
> | section | KB | % | changes… |
> |---|---|---|---|
> | `sprites` (398: **309 structure + 49 decoration** + 21 farmers + 15 crops + 4 npc) | 104 | 73% | structures/decorations ~daily; only ~40 sprites move per tick |
> | `wealthSeries` (21 farmers × per-day rows, full history re-sent) | 19.6 | 14% | **day boundary only**; grows linearly → ~100 KB/tick by day 100 |
> | `observer` | 10.7 | 7.5% | intra-day (must stay per-tick) |
> | `relationships` + `leaderboard` + rest | ~8 | 5.5% | intra-day |
>
> Concrete wins, in impact-for-effort order (all transport/snapshot-side, sim untouched; verify each with the fast 3-day/3-seed diff):
> 1. ~~**Send `wealthSeries` only on day boundaries**~~ ✅ **Done 2026-06-10.** `RenderSnapshot.wealthSeries` is now `SnapshotWealthSeries[] | null`: with a per-run `SnapshotSpriteState` (the server path) the series is rebuilt + sent only when `runHistoryRows.length` changed (rows only grow at day boundaries; `wealthRowsSent` tracks the last send); the client caches the last non-null value (`SimClient.cachedWealthSeries`). Builders without per-run state (tests) keep per-tick behavior. Steady-state snapshot 143 → 123 KB and the unbounded with-day growth is gone. Verified: typecheck, full suite green, 3-seed baseline diff MATCH (sim untouched).
> 2. ~~**Tooltip string churn — cheap half**~~ ✅ **Done 2026-06-10:** `daysGrowing` serializes as `toFixed(1)` in [sprites.ts](../../packages/sim-core/src/snapshot-builder/sprites.ts) (was the raw per-tick float, ~17 chars of churn per crop per tick). The bigger fix (descriptions in a separate id-keyed table, sent on change) folds into the brief-72 protocol rework like items 3/4.
> 3. **Coarse static/dynamic sprite split.** 358 of 398 sprites (structures + decorations) change ~daily; ship them as a separate message on change (the static *terrain* layer already works this way via `buildStaticLayerSprites`) and keep only the ~40 moving sprites per tick. ≈70% snapshot reduction without any binary codec.
> 4. **Omit default-valued sprite fields** (`rotation: 0`, `alpha: 1`, `action: null`, `id: null`…) from the JSON. ~261 B/sprite today; mostly boilerplate.
>
> ~~Gate before building 3/4: run [probe-perf.ts](../../tools/run-sim/src/probe-perf.ts) (1→5→10 synthetic viewers, ~3 min, loads the box — **needs user sign-off per the resource rule**)~~ — **GATE ANSWERED 2026-06-10** (user-approved ramp run; full table under "Measured results (2026-06-10)" below). Verdict: deflate already makes the *bytes* a non-issue on the wire (14× → ~7 KB/snap, ~150 KB/s/viewer) and serialization is small next to the tick — the cost that actually scales is **one full sim per WS connection** (~8% of a dev core + ~25 MB RSS per viewer; ~80% of one core at 10 viewers, all on one Node thread). So items 3/4 are **not** worth building as standalone JSON slimming; they fold into the shared-run/lobby protocol rework ([briefs/game/done/72](../briefs/game/done/72-shared-run-lobby-server.md)), which attacks the per-connection-sim model itself (encode-once broadcast). Items 1–2 remain worth doing regardless (item 1's unbounded growth is real: payload grew 100→126 KB within the probe's first ~3 sim-days).

### T1.3 WebSocket transport hardening — TODO (queued 2026-06-10, online-research pass)

The split (briefs 57–58) is new and the WS transport has cheap, high-value wins that **don't touch the sim** (render/transport-only → determinism untouched; re-verify with the fast 3-day/3-seed diff anyway). Grounded against the actual code:

- **Server today** ([server/src/index.ts](../../packages/server/src/index.ts)): `new WebSocketServer({ port })` with **no `permessage-deflate`, no `setNoDelay`**. It *does* drop-stale snapshots on `ws.bufferedAmount > 1MB` (correct for a spectator game) and sends `JSON.stringify(msg)`.
- **Client today** ([sim-client/client.ts](../../packages/farm-valley/src/worker/sim-client/client.ts)): renders **one tick (~50ms) behind** latest and lerps prev→current with `smoothstep(alpha)` — this is textbook snapshot interpolation and is *correct*, but a **1-tick buffer tolerates zero dropped snapshots** before it underruns.

TODOs, in impact-for-effort order:

- [x] **Enable `permessage-deflate`** in the `WebSocketServer` options. ✅ **Done 2026-06-10** ([server/src/index.ts](../../packages/server/src/index.ts), `perMessageDeflate: { threshold: 1024 }` — `threshold` skips tiny control frames). ~70–80% size reduction on repetitive JSON at near-zero CPU for 36KB frames. Typecheck clean; transport-only. *Verifying the Caddy WS reverse-proxy passes compression through in prod was **dropped by decision 2026-06-10** (open-questions round) — if the proxy strips it the app still works, just heavier frames.*
- [x] **Bump render delay 1 tick → 2 ticks (~100ms).** ✅ **Done 2026-06-10** (open-questions round): `renderDelayMs` is now `2 * msPerTick` in [client.ts](../../packages/farm-valley/src/worker/sim-client/client.ts), comment updated. Decided intentionally: display latency is irrelevant for a spectator game; absorbing a dropped snapshot + TCP retransmit is not.
- [x] **`setNoDelay(true)` on connection.** ✅ **Done 2026-06-10** ([server/src/index.ts](../../packages/server/src/index.ts) — narrows `ws._socket` since it's absent from the `ws` public types). No-op for today's large JSON frames, but in place ahead of any binary/delta codec (small frames + Nagle + delayed-ACK = ~40ms artificial latency).
- [ ] **Binary/delta wire codec — DEFER** (same gate as T1.1(a) / brief-09 #7). Only if `permessage-deflate` leaves bytes/sec too high at a real concurrent-viewer target. Quantized binary can reach ~4 bytes/entity (~1.2KB vs 36KB). Don't build speculatively.
- [ ] **`visibilitychange` handling (correctness).** rAF pauses when the tab is hidden; on return, the wall-clock `alpha` math can spike / the snapshot buffer can avalanche. Confirmed absent from the client; **briefed 2026-06-10** → [briefs/game/done/66-visibilitychange-pause-resync.md](../briefs/game/done/66-visibilitychange-pause-resync.md) (pause + full resync variant).

**Explicitly NOT worth it: WebTransport / WebRTC datagrams.** For a non-competitive *buffered* spectator game, TCP head-of-line blocking is absorbed by the interpolation buffer; WebTransport needs HTTP/3 (not in plain `ws`) + a ~15%-of-users fallback. Premature.

### T1.2 Per-frame interpolation allocates on the render thread
`getInterpolatedSprites()` runs every *frame* (~60fps, not per tick): `new Map()` of prev-sprites, `.map()` a fresh array, spread `{...s}` per sprite — [sim-client/client.ts](../../packages/farm-valley/src/worker/sim-client/client.ts), [main/render-loop.ts](../../packages/farm-valley/src/main/render-loop.ts). Classic GC-churn.

- Pool the interpolated sprite array + objects; mutate in place across frames.
- Index prev-sprites by id once when the snapshot arrives, not every frame.
- If sprite IDs are dense, replace the `Map` with a plain indexed array.

## Tier 2 — Culling & clipping (classic strategies, currently mostly absent)

The static backdrop is blitted each frame — now **clipped to the visible world rect** ([canvas2d/renderer.ts](../../packages/engine/src/render/canvas2d/renderer.ts) `endFrame`), so zoomed-in frames only blit the on-screen portion; but at the **default zoom the camera spans the whole 160×160 world** (see Tier 0), so the clip is a no-op there and the full baked canvas rasters every frame. Dynamic sprites/shadows are viewport-culled in `push()` — but that too is a no-op at default zoom (whole world in view). So the classic 2D wins still matter here:

- **Viewport culling of dynamic sprites/shadows.** Skip `push`/`drawSprite` for anything whose bounds fall outside `[viewLeft,viewRight]×[viewTop,viewBottom]` — the same test already used for foam in [main/render-loop.ts](../../packages/farm-valley/src/main/render-loop.ts). Cheap, and grows in value as entity count / world size grows.
- **Clip the static-layer blit to the visible source rect.** `drawImage(staticLayer, sx,sy,sw,sh, dx,dy,dw,dh)` using only the camera-visible region instead of the whole baked canvas. Saves fill work when zoomed in.
- **`ctx.clip()` / dirty-rectangle redraw.** Lower priority — the wash + full sprite repaint each frame make a true dirty-rect scheme awkward, but a clip region around the camera viewport prevents overdraw outside it.
- **Sort only when the set changes.** `this.queue.sort(compareSprite)` runs every frame ([canvas2d/renderer.ts](../../packages/engine/src/render/canvas2d/renderer.ts)); z-order rarely changes frame-to-frame. Bucket by layer or sort-on-dirty.

## Tier 2b-pre — Sim tick re-verified at 21 farmers (2026-06-10)

A 2-day headless run (2,400 ticks, 21 farmers, default world) completes in ~2s wall *including* Node startup — the sim tick is still **well under 1 ms against the 50 ms budget**, so the 2026-06-05 "engine far under budget" conclusion survives the 4× roster growth. A code sweep (2026-06-10) catalogued the remaining per-tick allocation/O(n²) sites for the record — **none are worth fixing for throughput at n=21**; they only matter as GC pressure if many SimHosts share one Node process (re-evaluate after probe-perf):

- [plot-sense.ts](../../packages/sim-core/src/systems/plot-sense.ts) — 4 fresh Maps per tick + per-farmer `.slice().sort()` of empty plots.
- [encounter.ts](../../packages/sim-core/src/systems/encounter.ts) — fresh sorted farmer array + by-region Map + O(n²/2) pair scan per tick.
- [rivalry/system.ts](../../packages/sim-core/src/systems/rivalry/system.ts) `activeAlliances()`/`activeRivalries()` — O(n²) pair scans, called **per snapshot tick** via the builder.
- [snapshot-builder/panels.ts](../../packages/sim-core/src/snapshot-builder/panels.ts) `buildRelationshipsData` — O(n²) trust matrix per tick (441 cells at n=21).
- [ap.ts:208](../../packages/sim-core/src/systems/ap.ts#L208) — `[...queue].sort()` per ACT farmer per tick.

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

Off by default (zero overhead). Diagnostic only — measures host timing, never sim state. Use these numbers as the before/after baseline for every task below. Tracked in [briefs/engine/done/09-perf-optimization.md](../briefs/engine/done/09-perf-optimization.md) (closed 2026-06-10). Post-split the "worker" side lives in [sim-host.ts](../../packages/server/src/sim-host.ts) (server) and the toggle rides the WS protocol.

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

### Measured results (2026-06-10, post-split: Node server, one SimHost per WS connection, 21-farmer world)

Brief-09 close-out re-profile under the real serving architecture. Server side: [probe-perf.ts](../../tools/run-sim/src/probe-perf.ts) (user-approved ramp, 1→5→10 synthetic drain-clients, real browser init: seed `0xc0ffee`, ticksPerDay 1200, 20 Hz, ~45 s sample/phase, WSL2 dev box). Client side: Playwright Chromium on `npm run dev` + `?profile`.

| Concurrent sims | Server CPU (of one core) | RSS | Achieved snapshot rate | Raw payload/snap | Wire/client | Deflate |
|---|---|---|---|---|---|---|
| 1 | 10.5% | 307 MB | 19.9/s | 99 KB | 141 KB/s | 14.1× |
| 5 | 44.7% | 412 MB | 19.9/s | 103 KB | 144 KB/s | 14.2× |
| 10 | **79.8%** | 528 MB | 19.9/s (no starvation) | 108 KB | 149 KB/s | 14.4× |

Sim-0 profiler across the run: `tick` mean 0.88 → 3.05 ms (grows with sim progression + event-loop contention; still ≤9% of the 50 ms budget), `snapshot.build` ~0.30–0.35 ms flat, `snapshot.bytes` 100 → 126 KB (grows intra-run — wealthSeries + crops). Client: `frame` 6.0 ms mean / 8.1 ms p95, `interp` 0.11 ms (T1.2 pooling holds), parsing 100 KB JSON at 20/s is comfortably absorbed.

One-snapshot composition (101.8 KB total): `sprites` 80.2 KB (302 sprites × ~266 B — each carrying hover `label`/`description` strings + serialized defaults `rotation:0`/`alpha:1`/`tintRgba`/`action:null`/`id:null`/`interpolate:false` every tick), `observer` 10.7 KB, `relationships` 5.0 KB, `wealthSeries` 2.4 KB (early-run; grows unbounded), `leaderboard` 2.2 KB. Confirms the T1.1 ranked-fix analysis.

**Verdicts.** (a) **~10 viewers fits a small 2-vCPU VPS, barely** — ~0.8 dev-core ≈ 1–1.6 small-VPS cores + ~530 MB RSS; all sims share one Node thread, so the hard ceiling is ~12–15 viewers before tick starvation. (b) **Brief-09 #7 (packed snapshot) stays dead in its successor form too**: bytes crossed the old re-trigger threshold (100–126 KB ≫ "tens of KB") but no budget is pressured — the scaling cost is whole sims per connection, which no codec fixes. (c) The real lever is **one shared run broadcast to N viewers** (~10× across the board) → [briefs/game/done/72](../briefs/game/done/72-shared-run-lobby-server.md); T1.1 items 3–4 fold into its protocol rework. (d) Wire bandwidth is a non-issue (10 viewers ≈ 1.5 MB/s ≈ 12 Mbps total).

⚠️ Probe side-finding: the 10-sim run loudly reproduced the open-questions "travel intents dropped en masse" issue — repeated `[travel] pathfinder fault from (x,y) to 'undefined'` with a WASM `RuntimeError: unreachable` escaping `Pathfinder.findPath` → caught per-intent in TravelSystem. Live servers hit this too; see [open-questions.md](open-questions.md).

## Suggested order of attack

1. ~~**Profile first**~~ — ✅ done (see "Measuring" above).
2. ~~T1.2 interpolation pooling + T2b loose allocations + Tier 2 viewport culling/clipping~~ — ✅ **done 2026-06-05** (brief 09 P1; behavior-preserving, multi-seed `EXPORT=json` byte-identical). Sort-on-dirty was partially deferred (live set is tiny after culling). Details: [briefs/engine/done/09-perf-optimization.md](../briefs/engine/done/09-perf-optimization.md).
3. ~~T1.1(b) snapshot interim win~~ — ✅ **done 2026-06-05** (events double-alloc removed). The brief's "cache observer/leaderboard per day" half was **dropped as incorrect**: that state changes intra-day (gold/FSM/AP/intention update on arbitrary ticks), so caching it would freeze the live panels.
4. ~~T1.1(a) SharedArrayBuffer/transfer boundary~~ — **dead, twice over (2026-06-10)**: the split removed the shared address space (no SAB across a socket), and the probe-perf ramp showed its successor (a packed wire codec) chases a cost that isn't the bottleneck — see "Measured results (2026-06-10)" and [briefs/engine/done/09-perf-optimization.md](../briefs/engine/done/09-perf-optimization.md) #7 close-out. The snapshot-payload work that *is* worth doing lives in T1.1 items 1–2 and [briefs/game/done/72](../briefs/game/done/72-shared-run-lobby-server.md).
5. ~~**T1.3 WebSocket transport quick-wins**~~ — ✅ **mostly done 2026-06-10**: `permessage-deflate` + `setNoDelay` + render-delay 1→2 ticks shipped; `visibilitychange` briefed ([game/done/66](../briefs/game/done/66-visibilitychange-pause-resync.md)); Caddy compression verification dropped by decision.
6. **Tier 3 game-feel** (queued 2026-06-10) — pixel-snap + camera smoothing briefed ([game/done/67](../briefs/game/done/67-pixel-snap-and-camera-smoothing.md)), ambient idle life briefed ([game/done/68](../briefs/game/done/68-ambient-idle-life.md)); number popups + juice deferred until those land. Game-feel briefs, not perf.

> **The AI-drama gap is the bigger product lever, but it is NOT a perf item.** Online research (2026-06-10) confirmed the leader-runaway flatness is a well-studied design failure mode (positive-feedback snowball + personality convergence + no cross-agent reaction), fixed by negative-feedback economics (market saturation), hard personality niche-exclusions, and a social-awareness belief layer + persistent "social-practice" trade landmarks. That work is tracked in [open-questions.md](open-questions.md) and [briefs/game/done/59-peer-interaction-and-rubber-banding.md](../briefs/game/done/59-peer-interaction-and-rubber-banding.md) — not here.

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
