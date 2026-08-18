# WebGL2 13 — corpus: retire the two-backend decision, rewrite the WebGPU-only claims

status: TODO (dispatch to a Sonnet executor; controller = opus verifies)
created: 2026-08-18
design-of-record: [2026-08-18-webgl2-00-BUILD-ORDER.md](2026-08-18-webgl2-00-BUILD-ORDER.md) · tracker: [2026-08-18-webgl2-BUILD-STATE.md](2026-08-18-webgl2-BUILD-STATE.md)
wave: 5 · depends on: 09 (may run in parallel with 12)

## Goal

Make the corpus describe the code that now exists. This migration falsifies a **locked decision** and
several wiki pages, and the project's own source-of-truth rule is *"the actual code wins over any
wiki claim"* — so leaving these stale is a real defect, not housekeeping.

## 1. `wiki/decisions.md` — retire and replace the Renderer decision

The current entry (~line 32) reads: *"**WebGPU-first, with Canvas2D as the fallback backend.**
(Formally revisited 2026-07-09 …) … `Canvas2dRenderer` is kept as a real, tested second backend for
the `node` test env and as a fallback. Engine render passes therefore come in pairs — a change to
one backend that skips the other is a bug, not a partial migration."*

Replace with a **WebGL2-only** entry dated **2026-08-18**, following the house pattern of naming what
it supersedes. It must record:
- **The trigger:** WebGPU browser support. Chrome/Edge 113+, Safari 26 (macOS Tahoe 26 / iOS 26),
  Firefox 141 (Windows) / 145 (macOS ARM64) — but **Firefox on Linux unshipped as of 2026-08**,
  Android in progress, plus the no-hardware-acceleration tail. Both 2D clients hard-forced
  `backend: "webgpu"`, so an unsupported browser got a **blank canvas**.
- **Why not keep WebGPU as a fast path:** the "passes come in pairs" rule had *already* drifted with
  only two backends — `setCloudOptions` was WebGPU-only and `OverlayFn` was honoured on Canvas2D but
  ignored on WebGPU. Both asymmetries are now gone (briefs 05, 07). One backend removes the tax
  permanently.
- **Why Canvas2D's stated justification didn't hold:** it was kept as "a real, tested second backend
  for the `node` test env" — but both backends were always tested against **stubs**
  (`canvas2d.test.ts` stubbed `getContext`; `webgpu/renderer.test.ts` stubbed `requestAdapter`).
  The stub, not the backend, is what makes `node`-env render tests work.
- **What we gave up:** compute shaders and storage buffers (neither was in use), and WebGPU's lower
  per-draw CPU overhead — acceptable because the engine runs far under frame budget on real hardware.
- **The one incompatibility and its resolution:** `var<storage, read> materials` in `scene3d.wgsl` →
  a `std140` UBO with a compile-time `MAX_MATERIALS`, exact value and rationale per brief 11
  (`FLOATS_PER_MATERIAL` is 4, so the packed array uploads unchanged). Documented fallback if it
  outgrows a UBO: `RGBA32F` lookup texture + `texelFetch`.
- **The new standing rule** replacing "passes come in pairs": *one backend; every colour in GLSL
  comes from a palette-role uniform, enforced by `glsl-lint.test.ts`.*

## 2. Pages with false claims to rewrite
- **`wiki/citadel-rendering.md`** — its `summary:` frontmatter says *"Citadel's WebGPU-only render
  path"* and line ~66 says *"Citadel is **WebGPU-only** at runtime (no Canvas2D fallback)"*. Both
  false. Line ~196's note about headless WebGPU + `--enable-unsafe-webgpu` needs a WebGL2 rewrite —
  and check whether headless rendering is now *possible* where it wasn't, since that changes what the
  page tells a future agent about screenshot tooling.
- **`wiki/architecture.md`** — the sim↔render boundary section and any backend naming.
- **`wiki/status.md`** — one line per brief, per the corpus convention. Add the 13 `webgl2-*` briefs.
- **`wiki/performance.md` / `performance-measurements.md`** — do **not** rewrite history. Add a dated
  note that measurements up to 2026-07-15 were taken on WebGPU/Canvas2D, and record brief 09's
  post-migration `fps` / `frame` / `ui.flush` numbers alongside. The tint-cache entry (3.36 → 57.06
  fps, brief 118) stays as-is — that win lives in the CPU rasterizer and survived the migration.
- **`wiki/citadel-decisions.md`** — the ~line 147 note about 256×256 sitting exactly on WebGPU's
  default texture limit. Still historically true; update it to name the WebGL2 `MAX_TEXTURE_SIZE`
  guard from brief 04.
- **`wiki/hollow-overview.md`** and `index.md`'s catalog line for it — both describe the renderer as
  "engine WebGPU renderer in `@engine/core/render3d`", and the `index.md` line also carries a
  "live 3D image Chrome-gated" trait that this migration **fixes**. Say so.
- **`wiki/shader-ideas.md`** — check whether it is written in WGSL. If so, note that new shaders are
  GLSL ES 3.00; do not rewrite the ideas themselves.
- **`wiki/mathquest-overview.md`** — any Canvas2D mention.

## 3. Mechanics
- Move all 13 `corpus/todos/2026-08-18-webgl2-*.md` briefs to `corpus/todos/closed/` as they complete
  (the controller does this at each wave gate; this brief closes out the remainder).
- Append **one** `log.md` entry: `## [2026-08-18] decision+migration | WebGL2-only render backend`.
  Follow the house style — what changed, why, what it supersedes, and the wave/brief map.
- `bash corpus/lint.sh` must pass: frontmatter present, **every relative link resolves** (this brief
  deletes paths that other pages link to — that is exactly what the link check catches), no page over
  the ~200-body-line cap.
- `bash corpus/lint.sh --index` to regenerate `index.md`'s catalog block from the `summary:` lines.
- Bump `updated:` on every page you touch.

## Out of scope
- Code changes of any kind. If a wiki claim and the code disagree, **the code wins** — fix the page,
  and if the code looks wrong, file it as a new todo rather than editing it here.

## Acceptance
- `bash corpus/lint.sh` passes clean.
- `grep -rin 'webgpu\|canvas2d' corpus/wiki/` returns only **deliberately historical** statements,
  each one dated or explicitly marked as superseded.
- `decisions.md` has exactly one Renderer decision and it says WebGL2.
- A reader who opens `index.md` → `decisions.md` → `architecture.md` and nothing else comes away
  with an accurate picture of the render stack.
