# Engine Task 03 — Engine Unit Tests

## Context

TypeScript game engine for a deterministic multi-agent sim. The engine already has runtime primitives (`FixedStepClock`, seeded `Rng`, `InputLog`), an ECS (`World` wrapping miniplex), a message bus, and asset loading. **None of it has unit tests yet.** Determinism is foundational — these tests should catch regressions in the determinism guarantees.

Your job: write a focused vitest test suite.

## Files you OWN (create only)

- `packages/engine/src/runtime/clock.test.ts`
- `packages/engine/src/runtime/rng.test.ts`
- `packages/engine/src/runtime/input-log.test.ts`
- `packages/engine/src/sim/message-bus.test.ts`
- `packages/engine/src/ecs/world.test.ts`
- `packages/engine/src/persistence/event-log.test.ts`
- `packages/engine/vitest.config.ts` (create if missing)

## Files you must NOT touch

- Any non-test file under `packages/engine/src/**` (read-only references only)
- `packages/engine/src/index.ts`
- `packages/farm-valley/**`
- The root `package.json` or `tsconfig.base.json`

## What to test (must cover)

### `FixedStepClock`
- Stable seed: given a known sequence of `advance(nowMs, onTick)` calls, the resulting tick counts and order are bit-stable across runs
- Catch-up cap: feeding a huge delta executes at most `maxTicksPerFrame` ticks per call
- `alpha` is in `[0, 1)` after partial accumulation
- `reset(tick)` restores `currentTick` and clears the accumulator

### `Rng` (mulberry32 in `runtime/rng.ts`)
- Determinism: same seed → identical sequences (compare first ~10 `nextU32` outputs)
- `snapshot()` / `restoreRng()` round-trips state exactly
- `range(min, max)` stays within bounds across 10k samples
- `pick([])` throws
- `fork(label)` is deterministic: same parent state + same label → same child sequence; **different labels yield different sequences** (assert first few outputs diverge)

### `InputLog`
- `record()` rejects out-of-order ticks (asserts throw)
- `drainForTick(t)` returns all events with `tick <= t` since cursor, advances cursor
- `serialize()` round-trip via `fromSerialized` preserves order
- Empty drain returns a frozen (or at least empty) collection without error

### `MessageBus`
- `send` then `flush` then `drain` returns the message; second `drain` (without `flush`) still returns the same (deliverable doesn't auto-clear on drain)
- A second `flush` swaps in the new batch and clears the old inflight
- `subscribeOntology` invokes handler exactly once per matching message in `notifySubscribers`
- Unsubscribe returned function removes the handler

### `World` (miniplex wrapper)
- `spawn` assigns increasing ids when none provided
- `spawn` preserves explicit `id` if set
- `despawn` removes entity from `query`
- `query("a", "b")` only matches entities with both components

### `event-log` (`persistence/event-log.ts`)
- `serialize` + `deserialize` round-trips a non-empty log
- Throws on unknown version

## Acceptance criteria

- `npm run test -w @engine/core` passes
- All assertions deterministic (no time-dependent fuzz without a seed)
- Use `vitest` (already a root devDep) — set up `vitest.config.ts` with `environment: "node"` (we don't need DOM for these tests; mocking RAF is not required)
- No `.js` extensions in imports
- No new deps added — vitest is already at the workspace root

## Difficulty & subagent split

**MIXED** — mostly mechanical, but the determinism properties (fork divergence, snapshot/restore equivalence) are subtle and easy to get wrong.

Recommended split:
- **Junior (sonnet) subagent** — writes the mechanical tests (`InputLog`, `MessageBus`, `World`, `event-log`, basic `Clock` tests)
- **Senior (opus) subagent** — writes the determinism property tests (`Rng` fork divergence, `Clock` bit-stability, `Rng` snapshot round-trip)
- Then verify both files exist, run the suite, and ensure all green

## Hints

- For `Rng` snapshot round-trip: do `r1.nextU32() x N; snap = r1.snapshot(); r1.nextU32() x M; r2 = restoreRng(snap); assert r2.nextU32() x M deepEqual to r1's M outputs from before`. Wait — that's wrong. Snapshot freezes a state; after snapping, both continue identically. So: `r1.nextU32() x N; snap = r1.snapshot(); seqA = [r1.nextU32() x M]; r2 = restoreRng(snap); seqB = [r2.nextU32() x M]; assertEqual(seqA, seqB)`.
- For `Clock` bit-stability: drive `advance(t, onTick)` with a fixed schedule of `t` values and assert the recorded `(callCount, tick)` log is byte-for-byte identical across two `FixedStepClock` instances.
