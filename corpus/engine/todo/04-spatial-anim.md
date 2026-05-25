# Engine Task 04 — Spatial Hash + Sprite Animation

## Context

TypeScript game engine for a multi-agent farming sim. We need two features the game can't ship without:

1. **Spatial hash grid** — fast O(1)-amortized nearest-neighbour and AABB queries for hundreds of agents. Today, agent-to-agent and agent-to-plot lookups are O(N) linear scans.
2. **Sprite animation** — frame-based animation for the existing `SpriteBatch`. Today, sprites are static. We need timeline-based clips driven by tick time, deterministic, restartable.

## Files you OWN (create + minimal modify)

### Spatial hash
- `packages/engine/src/spatial/hash-grid.ts`
- `packages/engine/src/spatial/index.ts`
- `packages/engine/src/spatial/hash-grid.test.ts`

### Animation
- `packages/engine/src/animation/clip.ts`
- `packages/engine/src/animation/animator.ts`
- `packages/engine/src/animation/index.ts`
- `packages/engine/src/animation/animator.test.ts`

## Files you must NOT touch

- `packages/engine/src/index.ts` (integration is my job)
- `packages/engine/src/ecs/components.ts` and any other existing engine file (read-only)
- `packages/farm-valley/**`

## What to build

### 1. `SpatialHashGrid`
- `new SpatialHashGrid({ cellSize })` — `cellSize` in world units
- `insert(id: number, x: number, y: number)` — adds; if id is already present, throws (no auto-move)
- `update(id, x, y)` — moves; O(1) amortized
- `remove(id)`
- `clear()`
- Queries (return arrays of ids, sorted ascending for determinism):
  - `queryAabb(minX, minY, maxX, maxY): number[]`
  - `queryCircle(cx, cy, r): number[]` (broad-phase via AABB; you may include narrow-phase distance check)
- Internally store entries as `Map<cellKey, Set<id>>` plus `Map<id, {x, y, cellKey}>` for fast move
- **Determinism:** query results must be sorted by id (not by insertion order or set iteration order)

### 2. Animation
- **`AnimationClip`** (data, immutable):
  - `name: string`
  - `frames: ReadonlyArray<{ frame: string; durationMs: number }>` — `frame` is an atlas frame name
  - `loop: boolean`
  - Method: `sampleAt(elapsedMs): { frameName: string; loopsCompleted: number; finished: boolean }`
  - Total duration is the sum of frame durations; for `loop=true`, `sampleAt(huge)` wraps; for `loop=false`, the last frame holds and `finished=true`.

- **`Animator`** (per-entity state, mutable):
  - `play(clipName: string, options?: { reset?: boolean }): void` — picks a registered clip
  - `update(deltaMs: number): void` — advances elapsed
  - `currentFrameName(): string | null` — null if no clip is playing
  - `addClip(clip: AnimationClip): void` — registers; throws on duplicate name
  - `clear(): void`

- Animator advances in real (wall) milliseconds — the game decides whether to drive it via fixed-step `stepMs` (deterministic) or via render delta. Document this in a JSDoc one-liner on `update`.

### 3. Tests
- `hash-grid.test.ts`:
  - insert + queryAabb covers a small bounding box
  - update moves the entry between cells (verify old cell no longer returns the id)
  - queryAabb spanning many cells returns correct, sorted-by-id results
  - queryCircle excludes entries outside the radius
- `animator.test.ts`:
  - `sampleAt` deterministic for fixed elapsed
  - `loop=true` wraps correctly past total duration
  - `loop=false` clamps to last frame and reports `finished`
  - `addClip` throws on duplicate

## Acceptance criteria

- `npm run typecheck` passes for `@engine/core`
- `npm run test -w @engine/core` passes for your tests
- Public APIs exported via `spatial/index.ts` and `animation/index.ts`
- No `.js` import suffixes
- No new runtime deps

## Difficulty & subagent split

**MIXED**:
- Spatial hash is performance-sensitive and easy to get subtly wrong (especially `update` cleaning up the old cell). Senior territory.
- Animation is straightforward bookkeeping. Junior territory.

Recommended split:
- **Senior (opus) subagent** for `spatial/*` — design `update` carefully, ensure determinism via sorted query results
- **Junior (sonnet) subagent** for `animation/*` — straightforward clip sampling
- Run them in parallel (both worktrees branch from the same base, no file overlap)
- After both return, run typecheck + test together

## Hints

- `cellKey` can be `\`${cellX},${cellY}\`` — fine for a few thousand entries
- Sorted query: gather ids into a single array, then `.sort((a,b) => a-b)` once at the end — don't sort per cell
- For `Animator.update`, just accumulate `elapsedMs`; let `sampleAt` do the wrapping
