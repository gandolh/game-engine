# Game Task 04 — Observer Dashboard + Config Panel

**Status:** Done
> Condensed 2026-06-13 — original spec in git history.

Build a DOM overlay above the WebGPU canvas: a live agent dashboard and a collapsible parameter tweaker. Pure DOM/CSS — no engine internals touched.

## What shipped

- **`packages/farm-valley/src/ui/observer.ts`** — `ObserverPanel(parent: HTMLElement)`: fixed-position right panel. `update(snapshot: ObserverSnapshot)` caches last text per row to avoid DOM churn. Shows day, weather (condition + multiplier), 3-day forecast, and per-farmer rows (name, personality chip, gold, crop inventory, FSM state, AP current/max with penalty suffix). `setVisible(v)` and `destroy()` (removes panel + detaches listeners).
- **`packages/farm-valley/src/ui/config-panel.ts`** — `ConfigPanel(parent, schema: ConfigSchema, onChange)`: collapsible panel (~240px), one input per `ConfigField` (number/boolean/enum), fires `onChange(key, value)` on edit, "Reset to defaults" button fires `onChange` for every key.
- **`packages/farm-valley/src/ui/dom.ts`** — helpers: `createEl`, `setText` (no-op if unchanged), `applyStyles`.
- **`packages/farm-valley/src/ui/index.ts`** — re-exports `ObserverPanel`, `ConfigPanel`, `ConfigSchema`, `ConfigField`, `ObserverSnapshot`.
- **Tests** (jsdom env): `observer.test.ts` covers first render, no-DOM-churn on unchanged update, sort order by id; `config-panel.test.ts` covers field rendering, `onChange` with parsed number, reset fires all keys.

## Key types

`ObserverSnapshot` — `{ day, weather: { condition, multiplier }, forecast: Array<{ condition, confidence }>, farmers: Array<{ id, name, personality, gold, crops: { radish, wheat, pumpkin }, fsm, apCurrent, apMax, apPenaltyPending }> }`.

`ConfigField` — discriminated union on `type: "number" | "boolean" | "enum"`.
