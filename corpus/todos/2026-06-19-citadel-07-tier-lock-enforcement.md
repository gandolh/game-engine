---
title: "Citadel 07 — Enforce tier-lock at placement (+ tier-aware palette, EDG guard)"
created: 2026-06-19
status: open
tags: [citadel, sim, ui, correctness, depth]
---

# Citadel 07 — Enforce the tier-lock

**Sequence: do FIRST.** Dependency for [citadel-08 (building upgrades)](2026-06-19-citadel-08-building-upgrades.md),
which reuses an *enforced* tier system to gate upgrade levels.

**Lineage:** surfaced during the tiny-world-builder idea-mining pass (2026-06-19).
Not a tiny-world feature per se — it's a Citadel **integrity gap**. The greyed
tier-locked-button UX echoes tiny-world's tool-mode build palette.

## The bug (verified 2026-06-19)

`TIER_LOCK` in [tiers.ts](../../packages/citadel-sim-core/src/systems/tiers.ts) declares
that `keep`/`garrison` need **Town**, and `wall`/`gate`/`tower`/`sawmill`/`smith`/`quarry`/`mine`
need **Village** — but it is **never consulted at placement**. The doc comment
(`tiers.ts:24`) claims it "is checked in the placeBuilding handler via `tierLockFor`",
yet **`tierLockFor` does not exist anywhere** and `placeOne`
([sim-bootstrap.ts ~L240](../../packages/citadel-sim-core/src/sim-bootstrap.ts)) only
checks bounds / occupancy / terrain. You can drop a Keep as a Hamlet. **The entire
Phase-5 progression spine is cosmetic** — climbing Hamlet→Village→Town→Citadel→Fortress
unlocks nothing; it only renames the settlement.

## Scope

1. **Sim enforcement.** In `placeOne`, before success: if `TIER_LOCK[buildingType]`
   exists and `!tierAtLeast(state.tier, required)`, return `false` and `pushEvent`
   a message (e.g. `"A Keep requires Town tier"`). `wall`/`gate` route through
   `placeOne` already (`sim-bootstrap.ts:331`), so drag-painted walls are covered —
   verify gate placement hits the same guard.
2. **Tier-aware build palette (client).** Grey/disable the build buttons for
   locked types based on `snapshot.tier` (snapshot already carries `tier: string`),
   with a tooltip stating the requirement ("Requires Village"). Button map lives in
   [main.ts ~L189](../../packages/citadel/src/main.ts). Keep the buttons **visible**
   (greyed, not hidden) so the player can see what climbing unlocks — this teaches
   the progression. The sim-side reject (step 1) is the defense-in-depth guard.
3. **Palette-guard hygiene (folded in — this brief already touches the palette UI).**
   Extend the EDG32 guard ([palette.test.ts](../../packages/engine/src/render/palette.test.ts))
   to scan `packages/citadel/src`, and route the raw hex literals in
   [main.ts ~L406-451](../../packages/citadel/src/main.ts) through `EDG.*` constants.
   (Values are already on-palette, so this is hygiene + future-proofing, not a visible fix.)

## Decisions (grilled 2026-06-19)

- **UX = grey + tooltip + sim-reject** (most discoverable; chosen over hide-until-unlocked and reject-only).
- Direction is **depth-first** — this brief makes the *existing* Phase-5 depth actually bite.

## Acceptance

- Placing a tier-locked building below its required tier fails and surfaces an event-feed line.
- Locked build buttons render greyed with a tier-requirement tooltip; they enable on promotion.
- The palette guard test scans the citadel package and passes; no raw hex literals remain in `main.ts`.
- **Determinism gate:** enforcement only rejects commands (sim stays deterministic), but
  tests that place locked buildings before reaching tier (phase4/phase5) must be updated.
  Run a fast 3-day / 3-seed `EXPORT=json` diff to confirm no baseline move — **ask before running** (resource limits).
- `npm run typecheck` + targeted vitest (`-w @citadel/sim-core`, citadel client tests) green.
