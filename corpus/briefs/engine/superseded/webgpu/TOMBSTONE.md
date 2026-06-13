# WebGPU Migration Wave-Plan — Tombstone (compacted 2026-06-13)

This directory once held a 12-file orchestrated wave-plan (00-INDEX, 01-architecture,
HANDOFF, waves 0–4) for migrating the renderer from Canvas2D to WebGPU.

**Why it's gone:** the wave-plan was an abandoned planning artifact. Its 00-INDEX was
marked "CLOSED / WON'T-DO — execution never started", **but that is misleading** — the
WebGPU migration actually *did* ship, via a different path (a direct `webgpu-migration`
branch + a 5-bug renderer review + the engine 12–16 shader wave), not by executing these
waves. The wave-plan never matched what was built, so keeping 65 KB of stale step-by-step
specs only invited confusion.

**Current reality (verify against code, not this file):**
- The game is **WebGPU-only**: `farm-valley/src/main.ts` forces `backend: "webgpu"`
  (throws → `showFatal` if unavailable). `Canvas2dRenderer` stays in `@engine/core` for
  tests / other consumers.
- The live backend is `packages/engine/src/render/webgpu/` (renderer, gpu-context,
  texture-atlas, sprite-batch, shadow-batch, particle-batch, static-layer-pass,
  cloud-shadow-pass, overlay-2d, + `shaders/*.wgsl`).
- Load-bearing render rules + the 5-bug review are in [log.md](../../../../log.md)
  ("Load-bearing facts from the 06-12 wave"); shader backlog in
  [wiki/shader-ideas.md](../../../../wiki/shader-ideas.md); WGSL validation guard = engine brief 11.

The original wave-plan prose is in git history (`git log -p -- corpus/briefs/engine/superseded/webgpu/`).
Reopen with a fresh brief if WebGPU is ever re-architected.
