# Project Status

Snapshot of where the Farm Valley engine + game sit relative to the task briefs in [../briefs/](../briefs/). As of 2026-05-26.

## Engine tasks

| Brief | Status | Notes |
|---|---|---|
| [01-tilemap](../briefs/engine/superseded/01-tilemap.md) | **Superseded** | WebGPU renderer was removed; Canvas2D took over. No `tilemap.ts` / `tilemap-shader.ts` shipped. If a tile layer is needed, it'll be a new Canvas2D-shaped brief. |
| [02-input](../briefs/engine/done/02-input.md) | **Done** | [packages/engine/src/input/](../../packages/engine/src/input/) — keyboard, mouse, input-manager + tests. |
| [03-tests](../briefs/engine/done/03-tests.md) | **Done** | All required suites exist: clock, rng, input-log, message-bus, world, event-log. |
| [04-spatial-anim](../briefs/engine/done/04-spatial-anim.md) | **Done** | [spatial/](../../packages/engine/src/spatial/) and [animation/](../../packages/engine/src/animation/) with tests. |

[../briefs/engine/todo/](../briefs/engine/todo/) is currently empty.

## Game tasks

| Brief | Status | Notes |
|---|---|---|
| [01-personalities](../briefs/game/done/01-personalities.md) | **Done** | aggressive, hoarder (+ CNP coordinator), opportunist all registered with tests. |
| [02-weather-crops](../briefs/game/done/02-weather-crops.md) | **Done** | weather-station, weather, crop-growth, ap all in [systems/](../../packages/farm-valley/src/systems/) + tests. |
| [03-market-shop](../briefs/game/done/03-market-shop.md) | **Done** | market, shopkeeper, auction systems + spawners + tests. |
| [04-observer-ui](../briefs/game/done/04-observer-ui.md) | **Done** | [ui/](../../packages/farm-valley/src/ui/) ships observer, config-panel, dom helpers + tests. |

[../briefs/game/todo/](../briefs/game/todo/) is currently empty.

## Post-corpus work (delivered, never had a brief)

- **Canvas2D renderer** replacing the planned WebGPU pipeline — [packages/engine/src/render/canvas2d.ts](../../packages/engine/src/render/canvas2d.ts). WebGPU code was deleted in commit `5ac7f8d`.
- **In-house ECS** replacing miniplex — [packages/engine/src/ecs/world.ts](../../packages/engine/src/ecs/world.ts). Removed external dep, kept the same `spawn` / `query` / `despawn` surface (commit `020406d`).
- **WASM pathfinding infrastructure** — new workspace [packages/wasm-modules/](../../packages/wasm-modules/) (AssemblyScript → `pathfinding.wasm`) consumed by [packages/engine/src/wasm/](../../packages/engine/src/wasm/) (`loader`, `memory`, `Pathfinder` class). Built artifacts committed under `packages/farm-valley/public/wasm/`. Loaded at game boot in [main.ts:226](../../packages/farm-valley/src/main.ts#L226).
- **Home screen** — pre-sim overlay with Start CTA — [packages/farm-valley/src/screens/home-screen.ts](../../packages/farm-valley/src/screens/home-screen.ts).
- **Headless sim runner** — [tools/run-sim](../../tools/run-sim/) (`npm run sim`), runs the deterministic sim with no renderer.
- **Offline world preview** — [tools/world-preview](../../tools/world-preview/) (`npm run preview`), static snapshot viewer for the world layout.
- **README + screenshots** at repo root.

## Open gaps

See [open-questions.md](open-questions.md) for the live list.
