# audit-22 — Deleted render backends still advertised in published metadata and live JSDoc

status: todo
created: 2026-09-13
context: repo audit 2026-09-13 (`improve`). A single sweep; one finding, several files. Directly contradicts a locked convention.

## The drift

Canvas2D and WebGPU were both **deleted** 2026-08-18 and WebGL2 is the only backend
([decisions.md](../../wiki/decisions.md) → Renderer, a locked convention). These still say otherwise:

**Published package metadata** (both packages have `prepack`/`publishConfig` wiring, so this ships to npm):
- [engine/core/package.json](../../../engine/core/package.json) `description`: *"… canvas2d/WebGPU render …"*
- [engine/ui/package.json](../../../engine/ui/package.json) `description`: *"… the same 2D renderer as the game scene (WebGPU + Canvas2D) …"*

**Live source JSDoc:**
- [games/citadel/client/src/render/citadel-renderer.ts](../../../games/citadel/client/src/render/citadel-renderer.ts)
  lines 1-16 and 249-254 — describes the module as "WebGPU-backed", says it will "force the WebGPU
  backend", and claims "no silent Canvas2D fallback — Citadel is WebGPU-only". The actual `createRenderer`
  call ~20 lines below passes **no** backend option, because
  [create-renderer.ts:15-18](../../../engine/core/src/render/create-renderer.ts#L15-L18) documents that the
  option "is gone".
- [games/citadel/client/src/render/window-controller.ts](../../../games/citadel/client/src/render/window-controller.ts) lines 18, 49
- [games/citadel/client/src/render/render-window.ts](../../../games/citadel/client/src/render/render-window.ts) line 12
- [games/hollow/client/src/main.ts](../../../games/hollow/client/src/main.ts) lines 257, 466, 475 — including a
  function commented as handling "when the WebGPU renderer can't start"

**Container comment:**
- `infrastructure/Dockerfile` line 2 calls Farm Valley "the Node half of the WebGPU game" — and this was
  added in commit `81057f1`, *after* the WebGPU deletion.

## Failure scenario

Two concrete ones, neither hypothetical:
1. **Shipping a lie.** Publishing `@engine/core`/`@engine/ui` puts an npm description advertising a render
   backend deleted a month before the package was cut. That is the first thing a prospective consumer reads.
2. **Misleading the next contributor.** Someone reading `citadel-renderer.ts`'s header before touching the
   renderer will believe backend selection is still live — try to pass `backend: "webgpu"`, or assume
   `onBackend` can report something other than `"webgl2"` — directly against a locked convention. This is
   the same class of staleness the engine's own `unsupported-notice.ts` was written to eliminate, persisting
   in the module whose job is talking to the renderer.

## Files you OWN
- the two package `description` fields
- the Citadel render JSDoc (3 files), Hollow's `main.ts` comments, `infrastructure/Dockerfile` line 2

## Files you must NOT touch
- **any code.** This is comments and metadata only. The runtime behaviour already matches the locked
  decision; if you find code that does not, that is a separate finding — report it, do not fix it here.
- `corpus/wiki/performance.md`'s historical WebGPU/Canvas2D references — that page is explicitly marked
  historical and its banner is correct as-is.

## Acceptance
- `grep -rn 'WebGPU\|webgpu\|Canvas2D\|canvas2d' engine/*/package.json games/*/client/src infrastructure/`
  returns only (a) deliberate historical tombstone references, and (b) nothing in a `description` field.
  Paste the output.
- Both package descriptions describe WebGL2 accurately.
- `npm run typecheck` + `npm run test` green (a comment-only change should be trivially green — if it is
  not, something else is wrong and worth reporting).
