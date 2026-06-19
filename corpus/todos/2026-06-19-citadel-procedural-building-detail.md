---
title: "Citadel — cheap procedural building detail (roofs/doors/windows + silhouettes)"
created: 2026-06-19
status: open
tags: [citadel, render, art, quick-win]
---

# Citadel — cheap procedural building detail

The **no-new-assets** interim slice toward Citadel visual quality (the full sprite
pass is [citadel-real-sprite-assets](2026-06-19-citadel-real-sprite-assets.md)).
Buildings are currently single flat quads; same-type buildings are indistinguishable
clumps. Add procedural, hash-seeded sub-quads so structures gain depth and read at a
glance — all in pure code, all EDG32, no art pipeline.

## Context

[quads.ts:142-172](../../games/citadel/client/src/render/quads.ts#L142)
`buildingQuad()` returns one rectangle per building (roads/gates already inset). The
sprite-batch can take many quads per building cheaply, so layer on:

- **Roof/eave band** — a 2-3px darker strip along the top edge (light comes from
  top-left per the project's committed light direction; see
  [wiki/asset-pipeline.md](../wiki/asset-pipeline.md) art-direction section). A
  matching 1px highlight on the top-left, shadow on the bottom-right gives instant
  pseudo-3D.
- **Door + windows** — small dark sub-quads placed deterministically by a hash of
  `(b.x, b.y, b.type)` so a row of houses isn't identical but is stable frame to
  frame (no `Math.random`).
- **Per-type silhouette hints** — e.g. mill = a small offset rotor/blade quad,
  market = an awning stripe, chapel = a spire notch — cheap shape cues that make
  building *type* legible without a full sprite.

Use only `EDG.*` constants (palette guard enforces this; the audit found Citadel's
render layer is already palette-clean). Determinism note: this is render-only and
must stay seedless/hash-based — never feed the sim.

## Acceptance

- Buildings show roof shading + door/window detail + a type cue, all hash-placed and
  stable across frames.
- Same-type buildings are visually distinguishable; type is readable at default zoom.
- Pure render, EDG32-clean, typecheck + palette guard green. Visible improvement in
  `npm run citadel`.
