---
title: "Citadel UI — show build price on hover + disable build button when unaffordable"
created: 2026-06-28
status: todo
tags: [citadel, ui, economy, building]
---

# Build cost on hover + affordability-gated build buttons

When the player hovers a building in the build menu, show **what it costs to build**;
**disable** (grey out) the button when the player can't afford it.

## ⚠️ Prerequisite — there is NO build cost today
Placement is currently **free** — `placeOne` in
[sim-bootstrap.ts](../../games/citadel/sim-core/src/sim-bootstrap.ts) checks tier /
terrain / occupancy but **charges no resources**. Only *upgrades* have a cost
(`upgradeCost` in [building.ts](../../games/citadel/sim-core/src/entities/building.ts)).
So this todo has two halves:

1. **Sim: introduce a per-type build cost.** Add a `BUILD_COST: Record<string,
   Partial<Record<GoodType, number>>>` to `building.ts` (mirroring `upgradeCost`), and
   have `placeOne` **debit the owner's stockpile** on placement, rejecting with a reason
   code (like the existing tier/occupancy rejects) when unaffordable. Deterministic
   (stockpile reads/writes only). Re-prove determinism — **baseline moves by design.**
   *(Balance the costs against the cozy economy — keep early buildings cheap so the
   forgiving cold-open (cozy-pivot Phase C) isn't gated behind a grind.)*

2. **Client: hover price + affordability.** On hovering a `#build-bar` button, show the
   cost (tooltip or a small cost chip) reading from `BUILD_COST`; compare against
   `snapshot.stockpiles` and **disable** the button (greyed, non-interactive) when the
   player lacks the goods. Re-enable live as stockpiles change.

## Acceptance
- Hovering a build button shows its resource cost; the button is visibly disabled when
  unaffordable and enables when the player can pay; placing a building debits the cost.
- Pairs with the cozy-pivot tier-lock UX (locked tools greyed) — same disabled-button
  affordance.
