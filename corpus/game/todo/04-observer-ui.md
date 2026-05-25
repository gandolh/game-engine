# Game Task 04 — Observer Dashboard + Config Panel

## Context

"Farm Valley" multi-agent sim. The Python project has an Observer Agent + a tiny web dashboard. You're building the equivalent for the TypeScript port, in-app, as a DOM overlay above the WebGPU canvas.

The user wants to **watch what every agent is doing** and **tweak parameters live**. This slice is pure DOM/CSS — no engine internals.

## Files you OWN (create)

- `packages/farm-valley/src/ui/observer.ts` — live agent dashboard (right side of screen)
- `packages/farm-valley/src/ui/config-panel.ts` — collapsible parameter tweaker (left side)
- `packages/farm-valley/src/ui/dom.ts` — small DOM helpers (`createEl`, `setText`, `applyStyles`)
- `packages/farm-valley/src/ui/index.ts` — re-exports
- `packages/farm-valley/src/ui/observer.test.ts`
- `packages/farm-valley/src/ui/config-panel.test.ts`

## Files you must NOT touch

- `packages/farm-valley/src/main.ts` — I integrate later
- Anything outside `packages/farm-valley/src/ui/`
- `packages/engine/**`

## What to build

### `ObserverPanel`
- Constructor: `new ObserverPanel(parent: HTMLElement)` — creates a fixed-position panel on the right
- `update(snapshot: ObserverSnapshot)` — re-renders contents. Should be efficient enough to call every frame; cache last text per row so we don't thrash the DOM.
- Show:
  - Current day, current weather (condition + multiplier), 3-day forecast
  - Per farmer (rows sorted by id ascending):
    - Name, personality (colored chip)
    - Gold, inventory totals (radish/wheat/pumpkin)
    - Current FSM state
    - AP current/max (with a `(penalty)` suffix if pending)
- The snapshot shape:
  ```ts
  export interface ObserverSnapshot {
    day: number;
    weather: { condition: string; multiplier: number };
    forecast: Array<{ condition: string; confidence: number }>;
    farmers: Array<{
      id: number;
      name: string;
      personality: string;
      gold: number;
      crops: { radish: number; wheat: number; pumpkin: number };
      fsm: string;
      apCurrent: number;
      apMax: number;
      apPenaltyPending: boolean;
    }>;
  }
  ```
- Style: dark theme, monospace font, fits within ~280px wide, scrollable if many farmers
- Provide a `setVisible(v: boolean)` method
- Provide a `destroy()` method that removes the panel and detaches listeners

### `ConfigPanel`
- Constructor: `new ConfigPanel(parent: HTMLElement, schema: ConfigSchema, onChange: (key, value) => void)`
- `ConfigSchema`:
  ```ts
  export type ConfigField =
    | { key: string; label: string; type: "number"; min: number; max: number; step: number; default: number }
    | { key: string; label: string; type: "boolean"; default: boolean }
    | { key: string; label: string; type: "enum"; options: string[]; default: string };

  export type ConfigSchema = ReadonlyArray<ConfigField>;
  ```
- Renders a collapsible section with one input per field, dispatching `onChange(key, value)` immediately on user edit
- Has a "Reset to defaults" button at the bottom that resets every field and fires `onChange` for each
- Style: dark theme, fits ~240px wide

### `dom.ts` helpers
- `createEl<T extends keyof HTMLElementTagNameMap>(tag: T, opts?: { text?: string; class?: string; style?: Partial<CSSStyleDeclaration> }): HTMLElementTagNameMap[T]`
- `setText(el, text)` — no-op if text is unchanged (avoid DOM churn)
- `applyStyles(el, partial)`

### Tests

- `observer.test.ts`:
  - first `update()` renders rows for two farmers
  - second `update()` with no changes does NOT call `textContent` setter (use a spy via `Object.defineProperty` on the row element OR just verify identity of child nodes is unchanged)
  - sorting: farmer with id 3 appears before id 5
- `config-panel.test.ts`:
  - rendering a schema produces one row per field
  - changing a number input fires `onChange` with parsed number
  - "Reset to defaults" fires `onChange` for every key
- Use jsdom (vitest's default if you set `environment: "jsdom"` in `packages/farm-valley/vitest.config.ts` — create if missing)

## Acceptance criteria

- `npm run typecheck` passes
- `npm run test -w farm-valley` passes
- `ObserverPanel`, `ConfigPanel`, `ConfigSchema`, `ConfigField`, `ObserverSnapshot` all exported via `ui/index.ts`
- No `.js` import suffixes
- May add `jsdom` as a pinned devDep in `packages/farm-valley` if absent

## Difficulty & subagent split

**EASY-MEDIUM** — DOM-only work, well-scoped, no engine internals.

Recommended: **single junior (sonnet) subagent** for the whole slice. If you (the orchestrator) want to be cautious, spawn a **senior (opus) subagent** for a final review pass after the junior finishes — verify accessibility (panels don't steal focus), efficient updates (no DOM churn on unchanged data), and no memory leaks (event listeners cleaned up in `destroy()`).
