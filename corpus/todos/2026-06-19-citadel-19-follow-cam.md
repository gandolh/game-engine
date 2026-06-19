---
title: "Citadel 19 — Follow-cam (lock onto a villager); first-person scoped out"
created: 2026-06-19
status: open
tags: [citadel, render, camera, spectator]
---

# Citadel 19 — Follow-cam

**Lineage:** tiny-world-builder's flight-sim line-of-sight tracking camera (a drone cam that
follows the flown object per-frame, exits to the free camera). Farm Valley's focus camera
(lock-follow a farmer with `expSmooth` glide on `Camera2D`) is the 2D-portable version.

**Target:** Citadel render/camera — [terrain-renderer.ts](../../packages/citadel/src/render/terrain-renderer.ts)
camera + [main.ts](../../packages/citadel/src/main.ts) click hit-test. **Render-only.**

## Idea

Right-click any villager to **lock-follow** it: `Camera2D` center lerps to its position with
an `expSmooth` glide; a HUD strip shows role / cargo / destination / fsm. Click empty space
or Escape to release. Port FV's focus-camera glide — **verify exact symbols before reuse**.

## Dependency / note

- Glides best with **villager interpolation** (a parked legibility item — without it the cam follows a teleporting dot). Either land interpolation first or accept a rougher follow.
- **First-person walk is 3D-only** (tiny-world's fly/walk mode) — there is no 2D analogue, so it is **scoped out**. The 2D equivalent is at most a high-zoom "over-the-shoulder" framing on the followed villager.

## Acceptance

- Right-click locks a smooth follow on a villager; HUD strip shows its state; graceful release on click/Escape and on despawn (night).
- Render-only; no sim change; typecheck + tests green.
