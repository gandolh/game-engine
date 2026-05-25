# Engine Task 02 — Input System

## Context

TypeScript game engine for a Stardew-Valley-like multi-agent farming sim. Fixed-step 20Hz deterministic sim with interpolated render; **all external inputs MUST flow through an event log so saves can be replayed from a seed + input log**.

You are building the **input system**: keyboard, mouse, and a per-tick queryable state. It must be deterministic-friendly — inputs are sampled and recorded once per tick.

## Files you OWN (create only)

- `packages/engine/src/input/keyboard.ts`
- `packages/engine/src/input/mouse.ts`
- `packages/engine/src/input/input-manager.ts`
- `packages/engine/src/input/index.ts`
- `packages/engine/src/input/input.test.ts`

## Files you must NOT touch

- `packages/engine/src/index.ts` (top-level barrel — integration is my job)
- Anything outside `packages/engine/src/input/`
- `packages/engine/src/runtime/input-log.ts` (already exists — read it, don't modify it)
- `packages/farm-valley/**`

## What to build

1. **`Keyboard`** — listens to `keydown`/`keyup` on a target element, keeps a `Set<string>` of pressed `KeyboardEvent.code` values. Methods:
   - `attach(target: Window | HTMLElement)`, `detach()`
   - `isDown(code: string): boolean`
   - `justPressed(code: string): boolean` — true only during the tick after press
   - `justReleased(code: string): boolean`
   - `endFrame()` — clears the "just" sets; call once per tick from `InputManager`

2. **`Mouse`** — pointer events on a target canvas:
   - `attach(canvas: HTMLCanvasElement)`, `detach()`
   - `position: { x: number; y: number }` in CSS pixels
   - `button(n: number): boolean`, `justPressed(n)`, `justReleased(n)`
   - `wheel: number` (resets on `endFrame`)
   - `endFrame()`

3. **`InputManager`** — composes Keyboard + Mouse. Single entry point:
   - `constructor(target: HTMLCanvasElement)` (window for keyboard, canvas for mouse)
   - `endFrame()` — calls both sub-managers
   - exposes `.keyboard` and `.mouse`
   - Has a `snapshot()` method returning a serializable object — useful for the InputLog integration later (do NOT integrate it now; just expose the shape)

4. **Tests** (`input.test.ts`) — at minimum:
   - `Keyboard.justPressed` is true on first observation after a `keydown` event, false on second `endFrame`
   - `Mouse.wheel` accumulates within a frame and resets on `endFrame`
   - `attach`/`detach` is idempotent and removes all listeners
   - Use `@vitest/utils` event helpers OR construct `new KeyboardEvent("keydown", { code: "KeyW" })` and `target.dispatchEvent(...)`. The engine tests already use jsdom-friendly patterns; you can configure `vitest.config.ts` if needed (you may create one if absent — but DON'T modify the game's vitest config).

## Acceptance criteria

- `npm run typecheck` passes
- `npm run test` (in `packages/engine`) passes for your tests
- `Keyboard`, `Mouse`, `InputManager` exported via `packages/engine/src/input/index.ts`
- No `.js` extensions in imports
- No new runtime deps; you may add `jsdom` as a devDep (pinned exact version) to engine if needed for tests

## Difficulty & subagent split

**EASY-MEDIUM** — DOM event handling, mostly mechanical. One subtle point: the "just pressed/released" lifecycle and ensuring it's reset exactly once per tick.

Recommended: a **single junior (sonnet) subagent** for the whole slice. Optionally, if you (the orchestrator) want extra safety, spawn a **senior (opus) subagent for review only** after the junior finishes — read the junior's diff and verify the just-pressed lifecycle is correct.

## Hints

- Use `KeyboardEvent.code` (not `.key`) for layout independence.
- Mouse coordinates: convert `clientX/Y` to canvas-local using `canvas.getBoundingClientRect()`.
- Don't preventDefault by default — let the game decide.
- Don't depend on `window` at construction time; require it via constructor or `attach()` so jsdom tests are clean.
