# WebGL2 migration — BUILD STATE / RESUME (live tracker)

status: **PLANNED — no code written yet.** 13 briefs authored 2026-08-18; wave 1 not yet dispatched.
updated: 2026-08-18

**Read this first to resume.** Design-of-record is
[2026-08-18-webgl2-00-BUILD-ORDER.md](2026-08-18-webgl2-00-BUILD-ORDER.md) — read it before any
brief. This file is the live progress tracker.

**The decision (2026-08-18, user directive):** remove Canvas2D, remove WebGPU, **one backend —
WebGL2** — for all four games including Hollow's 3D. Trigger was WebGPU browser support (Firefox on
Linux still unshipped; both 2D clients hard-forced `backend: "webgpu"` and gave unsupported browsers
a blank canvas). Rationale and the rejected alternative are in the BUILD ORDER.

## Progress

| # | Brief | Wave | Status | Commit | Notes |
|---|---|---|---|---|---|
| 01 | shared 2D vocabulary relocation | 1 | TODO | — | |
| 02 | GL context + shader tooling | 1 | TODO | — | |
| 03 | sprite + shadow batch | 2 | TODO | — | |
| 04 | static layer + water | 2 | TODO | — | |
| 05 | tint + overlay-2d + UI quads | 2 | TODO | — | |
| 06 | particles + weather | 2 | TODO | — | |
| 07 | cloud shadow + haze | 2 | TODO | — | |
| 10 | render3d device + buffers | 2 | TODO | — | |
| 08 | WebGl2Renderer assembly | 3 | TODO | — | |
| 11 | render3d scene renderer | 3 | TODO | — | |
| 09 | client switch + fallback screen | 4 | TODO | — | |
| 12 | delete WebGPU + purge types | 5 | TODO | — | |
| 13 | corpus + decisions update | 5 | TODO | — | |

## How we're building it
- Skill: **plan-split-dispatch**, backlog/wave mode. Controller (opus) plans/verifies/adjudicates;
  executor briefs dispatched to **Sonnet** subagents (standing user directive). **Never fable.**
- **New branch off current `main`** (`webgl2-migration`). Note: a stale `webgpu-migration` branch
  already exists from the *previous* migration — do not confuse or reuse it.
- Wave-2 briefs are worktree-parallel (disjoint new files). Per the project's worktree-swarm pattern:
  create every worktree from **current `main`**, and **diff each against `main` before merging** — a
  stale worktree base has bitten this repo before (Citadel Phase 3).
- **Verify gate after every wave** (controller runs it, not the subagent): `npm run typecheck`
  (workspace) + `npm run test -w @engine/core` (narrow) + `git status --porcelain` shows the expected
  new files. Commit only when green. Waves 3→4 additionally require the controller to **open the game
  and look**.

## Constraints (carry into every dispatch)
- **Visual parity is the acceptance bar, not green tests.** Standing lesson: green subagent tests have
  twice hidden inert features (dead economy in Phase 2, inert hazards in 4.5). This migration's
  failure mode is precisely "compiles, renders nothing" — every pass brief owes a screenshot.
- **Constrained hardware:** narrowest test scope while working; full suite only at briefs 09 and 12.
  **Never** run a determinism/EXPORT check — the controller asks the user first.
- **Palette rule reaches into GLSL.** No colour literals in shaders; colours arrive as uniforms from
  `EDG.*` / `CITADEL_PAL.*` / `MATE_PAL.*` / `HOLLOW_PAL.*`. Enforced by `glsl-lint.test.ts` (brief 02).
- **No `.js` import suffixes. Pinned versions. TS strict** + `noUncheckedIndexedAccess` +
  `exactOptionalPropertyTypes`.
- **Sim code is off-limits.** Rendering is downstream of the snapshot; no brief here touches a system,
  an agent, or the scheduler. Determinism is unaffected by design.
- **Subagent git rules:** no `git reset` / `checkout` / `stash`; commit only your own paths
  (concurrent sessions share the tree); the controller verifies exit status itself.

## Decisions taken during the build
_(append as they land — brief 13 folds these into the wiki)_
- **2026-08-18** — `MAX_MATERIALS` UBO size for `scene3d`: _pending brief 11._
- **2026-08-18** — `TEXTURE_2D` per sheet vs `TEXTURE_2D_ARRAY` for the atlas store: _pending brief 03._
- **2026-08-18** — `OverlayFn`: implement on the overlay canvas, or delete from `RendererLike`?
  _pending brief 05's grep for real callers._

## Verified-in-browser screenshots
_(paths recorded here as each brief lands — this is the evidence trail brief 12 relies on before it
deletes the WebGPU reference implementation)_

## Known risks going in
1. **MateQuest is the behavioural change.** It is the only game that ran on Canvas2D, so it is the
   only one moving to a GPU backend for the first time rather than between GPU backends. Expect
   trouble there, not in Farm.
2. **Texture v-origin flip** (WebGPU v=0 top, WebGL v=0 bottom). Fix in exactly one place; doing both
   cancels out and doing neither renders everything upside down.
3. **Blend state** — translate each pipeline's blend descriptor literally rather than assuming
   `SRC_ALPHA, ONE_MINUS_SRC_ALPHA`. Wrong premultiplication gives dark fringes on pixel-art edges:
   subtle enough to ship, obvious in a screenshot.
4. **Winding + depth convention** in 3D (brief 11) — a mismatch renders Hollow's town inside-out.
   Fix in the renderer, never in the shared `mat4.ts`.
5. **Context loss** is routine on WebGL2 (unlike WebGPU) and has no existing analogue in this
   codebase. Brief 02 defines the seam and makes loss degrade quietly; **full resource re-creation on
   restore is deliberately deferred** — file it as a follow-up todo, don't let it silently become a
   "known bug where the canvas goes black after a tab sleep".
6. **`@webgpu/types` is in 16 `package.json` files** because the `@engine/core` barrel transitively
   re-exported the WebGPU passes. Brief 12 must verify the GLSL equivalent does *not* leak the same
   way rather than mirroring the old workaround.
