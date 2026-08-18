# WebGL2 12 — delete both WebGPU backends, purge `@webgpu/types`

status: TODO (dispatch to a Sonnet executor; controller = opus verifies)
created: 2026-08-18
design-of-record: [2026-08-18-webgl2-00-BUILD-ORDER.md](2026-08-18-webgl2-00-BUILD-ORDER.md) · tracker: [2026-08-18-webgl2-BUILD-STATE.md](2026-08-18-webgl2-BUILD-STATE.md)
wave: 5 · depends on: 09

## Goal

Remove the WebGPU implementation now that WebGL2 is verified in a real browser across all four
games. **Do not start this brief until brief 09's verification report says parity.** Its whole
purpose is to delete the reference implementation, which is only safe once nothing needs comparing.

## Deletions
- `engine/core/src/render/webgpu/` — entire directory: 17 files, 3,167 LOC, including
  `gpu-context.ts`, `renderer.ts`, `sprite-batch.ts`, `shadow-batch.ts`, `texture-atlas.ts`,
  `static-layer-pass.ts`, `particle-batch.ts`, `weather-pass.ts`, `cloud-shadow-pass.ts`,
  `tint-pass.ts`, all `*.test.ts`, `wgsl.d.ts`, and `shaders/` (6 WGSL + `wgsl-lint.test.ts`).
  **Check `overlay-2d.ts` is already gone** — brief 05 moved it up a level. If it is still here,
  stop: something re-created it.
- `engine/core/src/render3d/webgpu/` — `device3d.ts`, `renderer3d.ts`, `pipeline-cache.ts`,
  `scene3d.wgsl`, `wgsl-lint.test.ts`. **Check `buffers.ts` + `buffers.test.ts` are already gone** —
  brief 10 moved them to `render3d/`.
- `engine/core/src/render/index.ts` and `render3d/index.ts` — remove any remaining WebGPU export.

## The `@webgpu/types` purge

`"@webgpu/types": "0.1.70"` appears in **16 `package.json` files** — and only `@engine/core`
genuinely needed it. It spread everywhere because the packages import the `@engine/core` barrel,
which transitively re-exported the WebGPU passes, so `tsc` demanded the ambient `GPU*` types:

```
engine/core  engine/ui
games/farm/{client,server,sim-core}  games/citadel/{client,server,sim-core}
games/mathquest/{client,sim-core}  games/hollow/{client,sim-core}
tools/{run-sim,world-preview,citadel-sim,hollow-sim}
```

Remove it from **all 16**, plus any `"types": ["@webgpu/types"]` entry in a `tsconfig`. Also delete
the three ambient shader decls that exist purely for this transitive-barrel reason:
`tools/run-sim/src/wgsl.d.ts`, `tools/world-preview/src/wgsl.d.ts`, `tools/hollow-sim/src/wgsl.d.ts`
(each has a header comment explaining the barrel re-export — read it, it is the confirmation).

**Do not add `*.glsl?raw` decls to the tools in their place unless `typecheck` actually demands
them.** GLSL is imported by `@engine/core` internals, not re-exported, so the transitive leak may
simply not recur — verify empirically rather than mirroring the old workaround. If a tool does need
one, that is a signal the barrel is re-exporting something it shouldn't; note it for the tracker.

Then `npm install` to update the lockfile, and confirm `grep -rn '@webgpu/types' --include=package.json .`
(excluding `node_modules`) is empty. Do not hand-edit `package-lock.json`.

## Also
- `grep -rn 'GPUDevice\|GPUBuffer\|GPUTexture\|navigator\.gpu\|requestAdapter\|wgsl\|WGSL' engine games tools --include=*.ts`
  → only historical prose should remain.
- Remove `wgsl_reflect` from `engine/core`'s deps if the two WGSL lint tests were its only consumers
  (check first — it may be used elsewhere).
- Delete the pinned `games/hollow/client/dist/` build artifact **only if** it is git-tracked and
  stale; it appeared in a WebGPU grep. Check `git ls-files` before touching it, and if it is
  tracked, ask rather than deleting a committed artifact.

## Out of scope
- Corpus/wiki updates (brief 13, in parallel with this one).
- Any behaviour change. Deletions and dependency edits only — if a hunk changes logic, it is
  misfiled.

## Acceptance
- `npm run typecheck` clean across the workspace.
- `npm run test` — full suite green (milestone).
- `npm run build` (Farm production build) and `npm run sim` + `npm run sim:citadel` +
  `npm run preview` all still work. The headless tools are the ones most likely to break on a
  barrel/ambient-types change, and they are easy to forget because no browser is involved.
- Both WebGPU directories gone; `@webgpu/types` in zero `package.json` files.
- The four games still launch and render (spot-check, not a full re-verification — brief 09 did that).
