# Wave 3 — Activation & Verification

**Agents:** 1–2. **Depends on:** Wave 2 merged & typecheck-green.
- **3a (activation, writer):** flip the factory + wire `main.ts`.
- **3b (verification, read-only + browser):** parity checks. Can run in parallel with 3a
  only after 3a commits; simplest to run 3a then 3b.

## 3a — Activation

### Files you own
- `packages/engine/src/render/create-renderer.ts` (flip default to WebGPU-first).
- `packages/farm-valley/src/main.ts` (use the async factory).

### Steps
1. `create-renderer.ts`: in `auto` mode, try `await tryCreateWebGpuRenderer(canvas, camera)`
   inside try/catch; on success `onBackend("webgpu")` and return it; on ANY error log a
   concise warning and fall back to `new Canvas2dRenderer(...)` + `onBackend("canvas2d")`.
   Keep `backend: "canvas2d"` and `"webgpu"` explicit overrides working.
2. `main.ts` (`setupRuntime`): replace `const renderer = new Canvas2dRenderer(canvas,
   camera)` with `const renderer = await createRenderer(canvas, camera, { onBackend: (b)
   => console.info('[render] backend:', b) })`. `setupRuntime` is already `async`, so
   awaiting is fine. The rest (addAtlas loop, `clearColor`, passing `renderer` to the loop)
   is unchanged because `RendererLike` covers the full surface.
3. Confirm `Runtime.renderer` is typed as `RendererLike` (widen the type if it was
   `Canvas2dRenderer`). Check `render-loop.ts`, `static-layer.ts`, `sprite-icon.ts` still
   typecheck against `RendererLike` — they should, since the interface was extracted from
   the class. If any uses a member NOT on the interface, report it (it means the interface
   is incomplete — fix the interface, owned by Wave 0 originally; coordinate via report).

### Acceptance
- `npm run typecheck` (root) clean. `npm run build -w farm-valley` succeeds (Vite resolves
  `.wgsl?raw` and the dynamic webgpu import).
- `npm run test` green across workspaces (tests still hit Canvas2D via jsdom fallback).

Commit: `webgpu(wave-3a): activate WebGPU-first factory + wire main.ts`.

## 3b — Verification (parity)

### Files you own
None (read-only). You may add ONE doc: `corpus/briefs/engine/done/webgpu/RESULTS.md` (or
hand findings back for the orchestrator to file). Do not edit source except to fix a
defect you find — and if you do, note exactly what and why.

### How to verify
Use the Playwright MCP browser tools against `npm run dev` (`:5173`):
1. Launch dev, open the page, confirm console shows `[render] backend: webgpu`
   **OR** `canvas2d` (on WSL2/Linux it may be canvas2d — that still validates the fallback;
   note which backend ran).
2. Screenshot the running game. Compare against expectations for each parity item in
   `01-architecture.md §6`: pixel crispness (no blur), sprite layering/occlusion, tints,
   flip/rotation, z-lift, static terrain + ground-noise/water-depth decorators, water
   scroll + swell, shadows, particles (e.g. trigger weather/forge), weather curtain,
   day/night wash over time, zoom in/out (mouse wheel), camera follow.
3. If WebGPU is unavailable in this environment, force it where possible (e.g. a Chromium
   with WebGPU) or at minimum confirm the **fallback** renders identically to pre-migration
   `main` and that forcing `backend: "webgpu"` throws cleanly into fallback.
4. Watch for console errors (WGSL compile errors, validation errors, device loss).

### Report
Fill the RESULTS doc with: backend that ran, per-item parity pass/fail with screenshots,
any defects + root cause, and a go/no-go for retiring Canvas2D as default. Do NOT retire
Canvas2D — it stays as the fallback permanently.

### Out of scope
No determinism checks, no sim runs, no perf benchmarking beyond a subjective fps note.
