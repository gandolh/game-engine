---
title: "Citadel — villagers only on roads while travelling; per-building occupancy badge (count of people)"
created: 2026-06-27
status: open
tags: [citadel, render, sim, villagers, roads, hud, ux]
---

# Citadel — villagers on roads only when moving; show building occupancy

Two related presentation changes so the population reads as *where people are*,
not as dots loitering on roads.

## Part A — villagers are on the road only when travelling

### Problem

Villagers are visible on road tiles even when they aren't going anywhere. A road
is a transit corridor; a villager standing on it idle reads as clutter and makes
it hard to tell who is actually in transit. People who are "at" a building (home,
farm, workshop, service) should be **inside / on that building's footprint**, not
parked on the nearest road.

### Wanted

A villager appears on a road tile **only while it is moving from one place to
another**. When a villager is assigned to / resident at / working at a building,
it lives over that building (see Part B), not on the road. Roads carry only the
in-transit population.

### Approach

- Drive road presence off the villager's **movement state**, not its position
  snapshot alone. The sim already steps units tile-to-tile and the client has an
  `EntityInterpolator.isMoving` notion
  ([entity-interp.ts](../../games/citadel/client/src/render/entity-interp.ts),
  added in [entity-movement-natural-feel](2026-06-27-citadel-entity-movement-natural-feel.md)) —
  use "is this unit currently travelling?" to decide whether to draw it on the
  road at all, vs. fold it into its building's occupancy badge (Part B).
- A stationary villager at a building should not be rendered as a free dot on a
  road tile; it's represented by the building's badge instead.

## Part B — per-building occupancy badge (number of people)

### Problem

You can't tell at a glance **how many people are where**. Unassigned villagers,
farm workers, workshop staff — there's no per-building readout of headcount.

### Wanted

Over each building, a **visual identifier showing the number of people in/at that
building**:

- **Unassigned villagers** → the count shows over the **house** (home) they belong
  to (so idle/unassigned population is visible over housing, not on roads).
- **Villagers working a farm** → the count shows over the **farm**.
- Likewise for workshops, services, and any other staffed building — the badge
  over a building is the number of people currently there.

The sum of all building badges (plus anyone genuinely in-transit on roads) should
equal the population — ties into
[entity-count-matches-population](2026-06-27-citadel-entity-count-matches-population.md).

### Approach

- Derive per-building occupancy from the sim's worker-assignment / residency data
  (production worker counts, home assignment, unassigned pool) — the snapshot
  already carries building staffing for the HUD; surface a per-building headcount.
- Render a small EDG32-palette badge anchored over the building footprint in iso
  space (reuse the existing building-label / overlay anchoring used by the
  coverage overlay and disconnected-road marker). Must stay on-palette (the
  `palette.test.ts` guard) and within the per-frame budget
  ([build-budget.ts](../../games/citadel/client/src/render/build-budget.ts)).
- Badge should update live as workers are (re)assigned and as villagers leave to
  travel (Part A) — a villager in transit is *not* counted in its destination's
  badge until it arrives (or count it at its current "owning" building; pick one
  rule and keep A/B consistent so the totals add up).

## Notes / constraints

- **Mostly render/HUD**, reading existing sim snapshot data — keep it off the sim
  path so determinism is untouched. If the snapshot needs a new per-building
  occupancy field, add it read-only on the snapshot, not as a sim behaviour change
  (no determinism re-proof needed if the sim's choices don't change).
- Keep Part A and Part B consistent: a person is counted **either** on a road (in
  transit) **or** in exactly one building badge, never both and never neither — so
  the grand total always equals population.

## Acceptance

- Idle/assigned villagers are **not** drawn on roads; only in-transit villagers
  appear on road tiles — verified in `npm run citadel`.
- Each building shows a headcount badge: unassigned over houses, farm workers over
  farms, etc.; badge updates live as assignments change.
- Sum of building badges + in-transit road villagers == population.
- Badge colours come from `EDG.*` (palette guard green); frame budget unaffected.
