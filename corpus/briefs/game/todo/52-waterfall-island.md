# Game Task 52 — Waterfall island (decorative, animated)

## Context

Part of the **"more islands"** theme (user request, 2026-06-09) — see
[brief 50](50-interactive-shrine-landmark.md) (shrine),
[51](51-heritage-sites-decorative-islands.md) (heritage sites),
[53](53-remote-bar-gold-for-ap.md) (remote bar),
[54](54-camping-rest-island.md) (camping). A waterfall is a strong visual
landmark and the one island in the set with an **animation** ask.

## Goal

Add a **waterfall island** — a scenic island with a cascading-water animation —
as a decorative focal point. No gameplay behavior; the value is visual life
(motion is rare on this otherwise mostly-static map; only farmers, the day/night
wash, the ocean ripple, and forge/mill accents animate today).

## Design

- **Presence-only** landmark (like brief 51), but with an ANIMATED waterfall.
- **Animation options** (pick the cheapest that reads well):
  1. A multi-frame waterfall tile cycled like the existing ocean ripple /
     forge-fire animation — check how `tile/ocean` water + `structure/forge-fire-a/b/c`
     animate ([render-systems/static-layer.ts](../../../../packages/farm-valley/src/render-systems/static-layer.ts), the
     `bakeWaterPattern` / NPC-pose cycling) and MIRROR that pattern. New atlas
     frames (`tile/waterfall-a/b/c`) → atlas rebuild + `atlas.test.ts`.
  2. Or a particle effect (falling water) reusing the particle system if cheaper.
- Reachable or scenic islet — your call (scenic avoids guard-test churn; reachable
  needs region + bridge + guard-test updates like brief 51).
- EDG32 palette only — water blues already exist in the palette (see ocean/coral).

## Files in scope (verify before editing)

- [tools/atlas-builder/src/recipes/](../../../../tools/atlas-builder/src/recipes/) — waterfall frames (if animated via atlas), then `npm run build` + commit the regenerated atlas artifact.
- [render-systems/static-layer.ts](../../../../packages/farm-valley/src/render-systems/static-layer.ts) / geometry.ts — render + the frame-cycling for the animation (mirror the ocean/forge animation).
- [regions.ts](../../../../packages/farm-valley/src/world/regions.ts) — region + bridge (if reachable).
- Particle system (if that route): packages/farm-valley/src/main/particles.ts.

## Determinism

Animation is a RENDER concern (driven by wall-clock frame time / tick on the main
thread), NOT sim — keep it out of the sim/snapshot determinism path, exactly like
the existing ocean ripple. No `Math.random` in any sim path; if the animation
needs variation, derive it from frame time or a fixed seed. EDG palette enforced.

## Acceptance

- `npm run typecheck` + `npm run test` green; atlas + `atlas.test.ts` updated if new frames; palette guard green.
- Waterfall visibly animates in `npm run dev`; reads as a landmark.
- world-generation.md updated.

## Workflow

Opus plans, Sonnet executes. The animation is the only real complexity — anchor
it to the EXISTING ocean/forge animation mechanism rather than inventing a new
one. Do not commit until asked.
