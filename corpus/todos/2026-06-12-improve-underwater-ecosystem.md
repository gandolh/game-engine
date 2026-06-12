---
title: Improve the underwater ecosystem
created: 2026-06-12
status: open
tags: [render, world]
---

# Improve the underwater ecosystem

Make the water feel like a living ecosystem rather than empty blue space — more
life, variety, visual interest beneath and around the water.

## Decisions (grilled 2026-06-12)

- **RENDER-ONLY ambient life + variety pass.** No sim/economy coupling. The
  ecosystem is NOT simulated — fishing yields, depletion, predator/prey are
  explicitly out of scope (that would be a much bigger, unstated feature
  entangling fishing balance).
- **What already exists** (don't rebuild): baked coral (layer 2), reef-fish shoals
  orbiting reefs, a gliding whale, paddling ducks, foam, and the below/at/above-
  surface depth ordering with translucent cool-blue submerged tint
  ([render-loop.ts](../../packages/farm-valley/src/main/render-loop.ts)
  `pushFishSchools`/`pushWaterDecor`). This todo is the additive "next step inward."
- **Add new animated water-life sprite kinds:** kelp/seaweed sway, jellyfish
  drift, crabs/starfish on the seabed, sea-turtles, more fish species, bubble
  columns — bestiary left to implementer discretion within this set.
- **Mechanics:** scatter via the existing blue-noise + loop-animation patterns;
  submerged translucent cool-blue tint. **Scatter *positions* seed off
  `WORLD_GEN_SEED`** for stability; loop-side `Math.random` for per-frame jitter is
  acceptable (render-only, NOT sim — never in sim paths). EDG32-only.

## Acceptance

- Several new kinds of animated water life populate the ocean, beneath and around
  the water, with visible variety.
- Render-only: no sim/economy/determinism impact; scatter positions stable per
  `WORLD_GEN_SEED`; EDG32 palette guard green.
