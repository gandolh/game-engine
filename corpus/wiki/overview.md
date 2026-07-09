---
summary: What Farm Valley is (a watch-it-play sim of 21 farmers over 100 days), its SPADE-prototype lineage, and the four personality archetypes.
updated: 2026-06-08
---

# Farm Valley — Overview

A top-down farming sim where a field of AI farmers (each with one of four personalities) plant, harvest, and trade across 100 in-game days. **You don't play; you watch them play.** The four named archetypes below are the protagonists; the roster scaled to **21 farmers (20 AI + the player Pip)** on 2026-06-08 (see [world-generation.md](world-generation.md)) — the extra farmers are archetype clones (`Cora-0`, `Atticus-1`, …) on procedurally-generated farm islands.

## What this codebase is

- A **reusable TypeScript game engine** ([engine/core](../../engine/core/)) — ECS, fixed-step deterministic sim, Canvas2D renderer, input, animation, spatial index, WASM bindings.
- **Farm Valley** ([games/farm/client](../../games/farm/client/)) — the first consumer of that engine. Multi-agent farming sim with BDI agents, message bus, market, weather, auctions.
- A **WASM workspace** ([engine/wasm-modules](../../engine/wasm-modules/)) — AssemblyScript source that compiles to `.wasm` artifacts consumed by the engine.
- **Tools** ([tools/](../../tools/)) — atlas-builder (sprite atlas), run-sim (headless), world-preview (offline snapshot viewer).

## Lineage

Farm Valley is a TypeScript port/extension of a Python [SPADE](https://spade-mas.readthedocs.io/) prototype (XMPP + FIPA-ACL + BDI + FSM). The Python codebase is the **gameplay spec**: agent personalities, the Contract Net Protocol for inter-farmer trade, the day-cycle FSM, the weather/crop/market economy. The TS rewrite ports the agent semantics onto an ECS engine running in the browser.

## Who's in it

| Farmer  | Personality   | Style |
|---------|---------------|-------|
| Cora    | conservative  | Plays it safe. Steady radish income. |
| Atticus | aggressive    | Big swings on diverse crops, accepts losses. |
| Hannah  | hoarder       | Fat gold reserve; plants only when sure. Runs CNP to buy from peers. |
| Otto    | opportunist   | Adapts to weather and supply on the fly. |

Each farmer is a [BDI](https://en.wikipedia.org/wiki/Belief%E2%80%93desire%E2%80%93intention_software_model) agent (Belief–Desire–Intention) running on an action-point budget per day.

## See also

- [architecture.md](architecture.md) — workspace layout, sim loop, data flow
- [decisions.md](decisions.md) — locked tech choices
- [status.md](status.md) — what's done, what's open
- [../README.md](../../README.md) — user-facing project README
