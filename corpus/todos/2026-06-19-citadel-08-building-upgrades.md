---
title: "Citadel 08 — Building upgrades (material-cost, tier-gated; the stacking mechanic)"
created: 2026-06-19
status: open
tags: [citadel, sim, ui, depth]
---

# Citadel 08 — Building upgrades

**Sequence: after [citadel-07](2026-06-19-citadel-07-tier-lock-enforcement.md)** — upgrade
levels are tier-gated and reuse the *enforced* tier system + `tierAtLeast`.

**Lineage:** tiny-world-builder's **stacking** system (re-place the same tool on an
existing object to enhance it, max 8 stacks). Recast for a city builder as
**upgradeable buildings** — the single genuinely-new sim mechanic worth taking
from that repo.

## Idea

Spend surplus **materials** to upgrade an existing building in place (L1→L2→L3)
for better core stats, instead of only sprawling new footprints. This finally
gives the refining chain (`planks`/`stone`/`tools`) a real **demand sink** beyond
walls, and adds a "densify vs. spread" decision.

## Scope

- **`level: 1|2|3`** on `BuildingRuntimeState`
  ([building.ts:20](../../packages/citadel-sim-core/src/entities/building.ts)); default 1.
- **New command `upgradeBuilding`** in the `CitadelCommand` union
  ([snapshot/index.ts:110](../../packages/citadel-sim-core/src/snapshot/index.ts)).
  Handler validates: building exists at tile, `level < max`, `tierAtLeast(state.tier, requiredForLevel)`,
  and the global `state.stockpiles` pool holds the material cost; then deducts
  materials and bumps level.
- **Stat effects by category** (broad set, incl. defense — your call):
  - **House** → higher pop cap.
  - **Production** (Farm/Woodcutter/Mill/Bakery/Quarry/Sawmill/Smith) → higher
    output rate and/or `workerSlots`. Effects derive from `BuildingProductionDef`
    + level multiplier.
  - **Defense** (Tower/Keep) → higher `defenseStrength` contribution.
- **Tier gate:** L2 = Village, L3 = Town (reuse `tierAtLeast`).
- **Cost curve:** rising material cost per level (L2 = planks/stone; L3 = more + tools).
  **Cap / steepen the defense curve** so upgraded walls/towers don't trivialize the
  siege layer — guard with a phase4 siege test.
- **UX:** a dedicated **Upgrade mode** in the client (no inspect panel this round) —
  click a building; ghost/cursor shows cost + valid/locked (mirrors placement-validity tinting).
- **Snapshot:** add `level` to `BuildingSnapshot`; renderer may show level pips (render-only, optional).

## Emergent interplay (note, don't add rules)

Upgrading consolidates output into the **same** footprint → fewer buildings for the
same throughput → **lower density → less fire spread**. This is a natural counter-play
to the "spread out to limit fire" pressure. No new fire mechanics needed.

## Decisions (grilled 2026-06-19)

- **Model = material-cost + tier-gated** (chosen over no-gate and auto-by-throughput).
- **Scope = broad incl. defense** (chosen over economy-only / food-spine-only) — with the defense cost-cap guard above.
- 3 levels; Upgrade-mode trigger.

## Acceptance

- An `upgradeBuilding` command upgrades a building when affordable + tier-allowed; rejects otherwise (with feedback).
- House/production/defense stats scale with level; defense scaling is capped/curved so siege stays winnable-losable.
- Materials are deducted from the global pool; refining chain now has a sink.
- **Determinism gate:** sim-touching (new command, stockpile deductions, stat recompute,
  siege contribution). Multi-seed `EXPORT=json` re-proof + phase4/siege tests — **ask before running**.
- `npm run typecheck` + targeted vitest green.

## Open tuning (resolve in-brief)

Cost-curve numbers, per-category stat deltas, defense cap. Balance during implementation, not front-loaded.
