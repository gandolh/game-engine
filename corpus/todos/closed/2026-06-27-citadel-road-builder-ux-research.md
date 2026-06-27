---
title: "Citadel — research how to make the road builder more user-friendly"
created: 2026-06-27
status: todo
tags: [citadel, ux, roads, research, input, build-tools]
---

# Citadel — make the road builder more user-friendly (research-first)

## Problem

The road builder works but is unintuitive. Today (see
[main.ts](../../games/citadel/client/src/main.ts) +
[placement-state.ts](../../games/citadel/client/src/ui/placement-state.ts)):
a click-drag in "Road" mode paints a run; the path is L-shaped (now obstacle-aware
auto-route — see the done todo
[citadel-road-routing-around-buildings](2026-06-22-citadel-road-routing-around-buildings.md)).
But the **interaction model** is still bare: no live cost/length readout, no clear
start/end affordance, easy to mis-drag, no segment editing, no undo of a bad run,
and the fact that the economy *depends* on road connectivity isn't taught
anywhere. Live testing (2026-06-27) showed a player can lay a road and not realize
a building stayed disconnected.

## This todo is research-first

Before building anything, **research online how good city-builders / RTS games make
road (and wall) drawing feel good**, and write up the findings + a concrete
recommendation for Citadel. Do not start implementation until the research note +
a picked direction land in the wiki.

### Research questions

- How do reference titles handle road *drawing* UX? Look at **OpenTTD / Transport
  Tycoon** (this repo already has an
  [openttd-art-and-gameplay-influence](2026-06-22-openttd-art-and-gameplay-influence.md)
  todo — tie into it), **Cities: Skylines** (drag, curves, snapping, cost
  preview), **Banished / Foundation / Manor Lords** (organic vs grid roads),
  **Factorio** (drag-build, ghost/blueprint, dragging to extend), **Anno**, and
  **Settlers**.
- Specific patterns to evaluate for our tile/iso grid:
  - **Live preview with cost + length + connectivity feedback** (does this run
    actually connect the two endpoints? highlight gaps in red).
  - **Drag-to-build vs click-each-tile vs point-A-then-point-B** ergonomics.
  - **Snapping** to existing roads / building entrances, and auto-extending an
    existing road when you start a drag on its end.
  - **Undo / cancel** of an in-progress or just-placed run.
  - **Diagonal / curved** roads on an iso grid (we're 4-connected today — is that
    the right constraint, or should rendered roads cut corners?).
  - Teaching connectivity: how do these games make "this building isn't hooked up"
    obvious without a tutorial wall-of-text?
- Accessibility / input: keyboard modifiers (straight-line lock, force-L,
  copy-segment), and how this maps to our right-drag-pan / left-drag-build scheme
  (right-click is already the camera pan — [main.ts](../../games/citadel/client/src/main.ts)).

### Deliverable

- A wiki note (e.g. `wiki/citadel-road-builder-ux.md`) summarizing the patterns
  found, with sources, and a **ranked recommendation** of which to adopt for
  Citadel given our constraints (iso tile grid, WebGPU sprite-batch renderer,
  road connectivity = economy-critical, deterministic sim where roads are
  commands).
- A short follow-up implementation todo carved from the chosen direction.

## Notes / constraints

- Road placement is a **deterministic sim command** (`placeRoad` /
  `placeWall` over tiles); any UX is a **client preview + command-builder** layer
  on top — keep the sim authoritative, like the existing auto-route work.
- Reuse what exists: `routeRoadPath` / `placement-state` already do obstacle-aware
  routing and have unit tests; this is about the *interaction shell* around them
  (preview, feedback, snapping, undo), not re-pathing.
- Whatever ships must respect the EDG32 palette (preview/feedback colors via
  `EDG.*`) and stay within the per-frame render budget.

## Acceptance (for the research phase)

- Wiki note exists with concrete cross-game findings + sources and a ranked
  recommendation for Citadel.
- A scoped implementation todo is filed from the recommendation.
