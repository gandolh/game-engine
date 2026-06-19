---
title: "Citadel 17 — Placement + idle animation easing"
created: 2026-06-19
status: open
tags: [citadel, render, juice]
---

# Citadel 17 — Placement & idle animation easing

**Lineage:** tiny-world-builder's animation queue — objects ease into place on placement, plus
ambient motion (tree sway, crop bob, chimney smoke). Farm Valley already has the building
blocks: foliage sway (shader wave brief 16), walk/work/idle-bob (game brief 32), ambient idle
life (brief 68), and the render-side animation-engine direction (brief 85).

**Target:** Citadel render only. **Render-only; pooled; off-sim RNG.**

## Idea

Buildings currently pop in instantly and sit static. Add: (a) an ease-in on placement
(scale/alpha tween over <200ms), (b) chimney smoke anchored to bakery/smith/woodcutter,
(c) subtle sway on trees and an idle bob on villagers. Makes placement feel tactile and the
settlement feel alive.

## Notes

- Smoke particles set up the consumer for [citadel-23 quantized-opacity caches](2026-06-19-citadel-23-quantized-opacity-caches.md).
- Reuse FV's animation/ambient modules — **verify exact symbols before reuse**.

## Acceptance

- Placement eases in; scenery has ambient motion; villagers bob.
- Pooled + capped; off-sim RNG (zero determinism impact); `EDG.*` colours; typecheck + tests green.
