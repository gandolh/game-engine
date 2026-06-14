---
title: Casino island should be open-air — no building, tables/activities outside
created: 2026-06-12
status: done
tags: [render, world]
depends_on: [foundation-grow-grid-to-240, foundation-theme-decor-table]
---

# Casino island should be open-air — no building, tables/activities outside

> **DONE 2026-06-12.** Removed the casino building (dropped `decoration/casino` +
> `decoration/casino-hotel` from `BIG_STRUCTURES`). Casino island already enlarged to
> 12×12 (bigger-neutral-islands pass); bridge to fishing-isle re-verified clean.
> **Gaming props (added 2026-06-12 on user request):** authored 5 new EDG32 atlas
> recipes — `decoration/slot-machine` (16×32), `blackjack-table`/`dice-table`/
> `shell-game` (32×24), `roulette` (32×32) — and placed a deliberate BIGGER layout on
> the casino island (2 slots + roulette centerpiece + blackjack + dice + shell-game)
> as bottom-anchored, island-locked `BIG_STRUCTURES`. Casino is intentionally NOT
> theme-scattered (the deliberate layout IS the content; random scatter would clutter
> the baked props). Marina boats (`CASINO_STATICS`) kept, scaled to ride with the
> island. Atlas rebuilt (`npm run atlas`). **Removed the leftover neon-glint particle
> emitter** (render-loop.ts) — the casino tower/business is gone, so the tower-crown
> twinkle no longer applies.
>
> **Also fixed a grow (#0) regression found here:** `BIG_STRUCTURES` (forge-house,
> carpenter-workshop, weather-station, weather-antenna, volcano) had hardcoded
> 160-scale coords and were baking in open ocean post-grow. Now locked to their
> island via `scaleAroundNearestIsland`; a new geometry.test guard asserts every
> baked structure sits on land + the expected islands carry one. Full repo **1074
> tests** + typecheck green. See [log.md](../log.md) 2026-06-12.

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
