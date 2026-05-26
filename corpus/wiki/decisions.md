# Locked Decisions

Tech choices that are settled. Listed here so future briefs and reviews don't relitigate them. Change requires an explicit revisit + note in [log.md](../log.md).

## Stack

- **TypeScript strict.** No `any` escape hatches without a comment.
- **npm workspaces.** Not pnpm/yarn.
- **Vite** for dev/build.
- **Vitest** for tests; `node` env for engine, `jsdom` env for farm-valley UI.
- **Pinned versions.** No `^` or `~` in any `package.json`. Reproducibility wins.
- **No `.js` import suffixes.** TypeScript-style imports throughout.

## Sim

- **Fixed step at 20 Hz.** Render interpolates with `alpha`.
- **Fully deterministic.** Seeded `Rng` (mulberry32). No `Math.random` or `Date.now` in sim code.
- **Save model:** seed + event-sourced input log. Not snapshots.

## ECS

- **In-house ECS** at [packages/engine/src/ecs/world.ts](../../packages/engine/src/ecs/world.ts). Replaced miniplex in commit `020406d` to drop the external dep.
- **BDI as components.** `Beliefs` / `Desires` / `Intentions` + an `FSMState` component. Deliberation system dispatches by `Personality` tag.

## Renderer

- **Canvas2D**, not WebGPU. WebGPU was removed in commit `5ac7f8d` after it added complexity disproportionate to what the game needed. If perf demands push the renderer again, the next step is profiling Canvas2D first, not reaching for WebGPU.

## Assets

- **Build-time procedural atlas** via [tools/atlas-builder](../../tools/atlas-builder/). PNG + JSON manifest. No external art pipeline.

## Concurrency

- **Single-threaded for now.** Sim is kept pure so it can move to a Web Worker later.
- **Scale target:** 50–100 agents. Engine APIs should not assume that ceiling.

## WASM

- **AssemblyScript** for native-speed kernels — TypeScript-shaped, no native toolchain, ships as an npm package. See [packages/wasm-modules/README.md](../../packages/wasm-modules/README.md).
- **Built artifacts committed** under `packages/farm-valley/public/wasm/` so fresh clones don't need to build wasm first.

## Source-of-truth for gameplay

The Python SPADE prototype (XMPP + FIPA-ACL + BDI + FSM) is the gameplay spec. The TS rewrite ports the agent semantics — performative + ontology + body, BDI components, FSM states, day-clock — onto the ECS engine. When the Python design and the TS implementation disagree, the Python design wins unless explicitly overridden here.
