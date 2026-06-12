# Brief 11 (engine) — real WGSL validation in the test suite

## Why

WGSL is invisible to tsc and vitest: a reserved-keyword identifier in a shader **black-screened the whole game** with no failing test (2026-06-12, see [wiki/status.md](../../../wiki/status.md) gotcha + log.md). The stopgap [wgsl-lint.test.ts](../../../../packages/engine/src/render/webgpu/shaders/wgsl-lint.test.ts) scans for reserved keywords only — it would not catch a type error, a missing semicolon, a bad builtin name, or an undeclared identifier. Now that the game is **WebGPU-only**, shader breakage is total breakage.

## Tasks

1. **Pick a node-side WGSL parser/validator** usable as a pinned devDependency (candidates to evaluate: `wgsl_reflect`, naga compiled to wasm, or the `wgslsmith`/`tint` ecosystem). Criteria: runs in vitest `node` env, no network, catches at least parse + identifier errors.
2. **Extend the guard test** to parse/validate every `*.wgsl` under [packages/engine/src/render/webgpu/shaders/](../../../../packages/engine/src/render/webgpu/shaders/) (glob, so future shaders are covered automatically). Keep the existing reserved-keyword scan if the parser doesn't subsume it.
3. **Prove it bites:** temporarily break a shader (the exact reserved-keyword class that caused the black screen, plus a syntax error) and confirm the test fails, then revert.

## Acceptance

- A syntactically/semantically broken `.wgsl` file fails `npm run test` with a message naming the file and line.
- Pinned version, devDependency only, no `.js` import suffixes, no runtime cost.
- If no acceptable validator exists, document the negative result in [wiki/shader-ideas.md](../../../wiki/shader-ideas.md) (or a new wiki note) and strengthen the regex lint instead — don't leave the question open.
