---
title: Casino island should be open-air — no building, tables/activities outside
created: 2026-06-12
status: open
tags: [render, world]
depends_on: [foundation-grow-grid-to-240, foundation-theme-decor-table]
---

# Casino island should be open-air — no building, tables/activities outside

No building/structure on the casino island; the casino content (gaming tables,
activities) sits **in the open air** on the island terrain. The island is enlarged
to fit the layout comfortably.

## Decisions (grilled 2026-06-12)

- **PURE DÉCOR — no gambling mechanic in this todo.** Acceptance is only "no
  building, tables outside, island bigger" — all render. Tables/roulette/etc. are
  render-only scatter via a new `casino` entry in the
  [theme + décor table](2026-06-12-00-foundation-theme-decor-table.md). No sim, no
  interaction, zero determinism risk. (Gambling-as-a-mechanic, if ever wanted, is
  a separate todo that would share the ring-box gold/seeded-outcome machinery.)
- **Remove the casino building.** Today `casino` is a scenic `landmark` with only a
  `CASINO_NEON_TILE` render anchor — drop any building footprint / `solid`
  blockers; replace with open-air themed props.
- **Enlarge** `CASINO_BOUNDS` (rides on the
  [grow-grid](2026-06-12-00-foundation-grow-grid-to-240.md) — casino is a dead-end
  leaf bridged to the fishing isle, so re-verify its bridge after resize).

## Acceptance

- No building/structure on the casino island.
- Casino tables + activities render as open-air décor on the island.
- Island enlarged to fit; its bridge + ≥2-tile margin still hold; determinism
  preserved (décor is render-only).
