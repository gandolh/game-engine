# WebGPU renderer (deprecated)

Quarantined on branch `feature/wasm-infra`. The game renders through
`packages/engine/src/render/canvas2d.ts` only; these files are kept for
reference until we decide whether to revive a GPU path.

- Not included in the engine's `tsconfig` `include` glob.
- Not picked up by vitest (excluded in `vitest.config.ts`).
- Not exported from `@engine/core`.

If you bring this back, re-add `@webgpu/types` to `tsconfig.base.json` and the
engine `package.json`, and restore exports in `src/render/index.ts` +
`src/assets/loader.ts` (`loadAtlas`).
