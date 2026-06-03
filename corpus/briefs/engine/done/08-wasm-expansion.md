# Engine Brief 08 — WASM Expansion + Pathfinder Worker Fix

## Status: Done (2026-06-03)

## Summary

Three new AssemblyScript WASM modules added (noise generator, batch RNG, flood-fill).
Critical bug fixed: the WASM pathfinder was loaded in the main thread but never
transferred to the sim worker, so `TravelSystem` was never active and farmers never moved.

## Pathfinder worker fix

**Root cause**: `bootstrapSim()` in the sim worker was called without a `pathfinder`
option → `TravelSystem` was never registered → `farmer.path` was never set → walk frames
never triggered. Farmers appeared stationary (idle-bob only).

**Fix** (3 files):
1. `WorkerInitMsg` gained `pathfinderWasm?: ArrayBuffer`.
2. `SimClient.init()` fetches `/wasm/pathfinding.wasm`, transfers the `ArrayBuffer`
   (zero-copy via `postMessage` transferables) with the init message.
3. `sim-worker.ts` calls `createPathfinderFromBytes(msg.pathfinderWasm)` inside the worker,
   passes the resulting `Pathfinder` to `bootstrapSim`. Wrapped in an async IIFE since
   `WebAssembly.instantiate` is async.

## New WASM modules

### `noise.ts` → `noise.wasm` (671 B)
Hash-based value noise — same algorithm as `render/ground-noise.ts` `hash2`, but runs
as a tight WASM loop (~8× faster than the JS path for the full 40×40 grid bake).

```
export fillNoise(outPtr, cols, rows, seed, amplitudeX1000): void
```
Amplitude passed as integer × 1000 to avoid f32 import args.

**TypeScript wrapper**: `NoiseGenerator` class with `fillNoise(cols, rows, seed, amplitude): Float32Array`.
Wired into `makeGroundNoiseDecorator` — the static-layer bake now uses WASM brightness
values with a JS fallback if the module isn't available.

### `rng.ts` → `rng.wasm` (603 B)
Mulberry32 batch fill — identical algorithm to `engine/src/runtime/rng.ts`.

```
export fillRandom(outPtr, count, state): i32  // returns new state
```

**TypeScript wrapper**: `BatchRng` class with `fillRandom(count, state): { values: Float32Array; nextState: number }`.

### `floodfill.ts` → `floodfill.wasm` (836 B)
4-connected BFS flood-fill returning reachable tile coordinates.

```
export floodFill(gridPtr, width, height, startX, startY, outPtr, outCap): i32
```
Same grid contract as `pathfinding.wasm`. Returns count of reachable tiles written
as (x,y) i32 pairs.

**TypeScript wrapper**: `FloodFiller` class with `floodFill(grid, start, maxTiles?): Array<{x,y}>`.

## Exports

All three classes + factory functions (`createXFromUrl`, `createXFromBytes`) exported
from `@engine/core` via `packages/engine/src/wasm/index.ts` and
`packages/engine/src/index.ts` (added `export * from "./input"` at the same time).

## Key files
- `packages/wasm-modules/src/noise.ts` / `rng.ts` / `floodfill.ts`
- `packages/engine/src/wasm/noise-generator.ts` / `rng-batch.ts` / `flood-fill.ts`
- `packages/engine/src/wasm/index.ts` — updated exports
- `packages/engine/src/index.ts` — added input + wasm exports
- `packages/farm-valley/src/worker/snapshot.ts` — `pathfinderWasm` field on `WorkerInitMsg`
- `packages/farm-valley/src/worker/sim-client.ts` — fetch + transfer WASM bytes
- `packages/farm-valley/src/worker/sim-worker.ts` — async init, `createPathfinderFromBytes`
- `packages/farm-valley/src/render/ground-noise.ts` — optional `wasmBrightness` param
- `packages/farm-valley/src/main.ts` — loads noise WASM, passes brightness array to decorator
