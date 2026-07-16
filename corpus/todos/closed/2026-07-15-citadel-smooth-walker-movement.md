---
title: "Citadel — humans on paths should move smoothly like Farm Valley NPCs"
created: 2026-07-15
status: closed (2026-07-16, `4bc3a4b` — snapshot-jitter holds, not missing interp; render-delay buffer 1.5)
tags: [citadel, render, movement]
---

# Citadel: smooth movement for humans walking on paths

Treat the humans walking on paths in Citadel like the farmers in Farm Valley:
they should move smoothly across the screen instead of stepping, the way Farm
Valley NPCs do.

## Context

- Farm Valley achieves smooth motion by interpolating between the latest two
  `RenderSnapshot`s using `alpha` on the render side. Citadel runs its sim in a
  Web Worker posting snapshots over `postMessage` — check whether the Citadel
  renderer interpolates at all, or draws entities at their raw snapshot/tile
  positions.
- This is a render-side change; the sim tick output must stay deterministic and
  untouched.
- See [wiki/citadel-overview.md](../wiki/citadel-overview.md).

## Acceptance

Humans walking on Citadel paths glide smoothly between positions (no visible
tile-stepping), matching the movement quality of Farm Valley farmers.

## Resolution (2026-07-16)

Diagnosis overturned the todo's premise: villagers/raiders were ALREADY interpolated (brief 104
Catmull-Rom corner smoothing) and the sim moves them cleanly one tile per tick (headless repro:
0% mid-travel holds). The real cause was snapshot arrival jitter — measured live in the client:
698 intervals, mean 49.97ms but p50 47 / p99 76 / max 88ms (setInterval coalescing + postMessage
bursts). The unbuffered alpha raced prev→cur and clamped at 1, so ~41% of gaps ended in a
hold-then-jump at the target tile — the visible stepping. Fix (matching Farm's approach): a
render-delay jitter buffer — `positionOf` takes an unclamped phase and draws
`RENDER_DELAY_INTERVALS = 1.5` snapshots behind the newest, interpolating whichever already-arrived
history pair brackets the render time (hold rate → ~2%; 1.5 rather than Farm's 2 keeps the
vanish-into-door latency ~1 tile on short cozy paths). Corner smoothing improved as a side effect
(the buffered segment knows its next tile → true two-sided Catmull tangent). `snapshotAlpha` →
`snapshotPhase`; follow-cam targets the interpolated position. Render-only; sim byte-untouched.
Residual: if stepping is still reported at 1×, raise the constant toward 2.0.
