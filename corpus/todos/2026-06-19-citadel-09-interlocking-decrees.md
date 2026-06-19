---
title: "Citadel 09 — Interlocking decree payoffs (tithe + conscription)"
created: 2026-06-19
status: open
tags: [citadel, sim, governance, depth, correctness]
---

# Citadel 09 — Make the stub decrees real

**Sequence: independent** — can run in parallel with [citadel-10](2026-06-19-citadel-10-hauler-rerouting.md)
after 07→08 (no hard dependency).

**Lineage:** surfaced during the tiny-world-builder mining pass (2026-06-19) — a
Citadel **integrity gap**, not a tiny-world feature. Governance depth.

## The lie (verified 2026-06-19)

Of the four decrees, two are **real** and two are **UI lies**
([needs-happiness.ts:106-109](../../packages/citadel-sim-core/src/systems/needs-happiness.ts)):

- `rationing` −10 happiness **and** −25% consumption ([immigration.ts:55](../../packages/citadel-sim-core/src/systems/immigration.ts)) ✅
- `workHours` −12 happiness **and** +30% output ([production.ts:71](../../packages/citadel-sim-core/src/systems/production.ts)) ✅
- `tithe` −8 happiness, **no benefit anywhere** ❌
- `conscription` −5 happiness, **no benefit anywhere** ❌

## Scope — interlocking risk/reward payoffs

Constraint: **no coin economy** (APR decision #28) — tithe must be a *goods* mechanic, never money.

- **TITHE** — each day, siphon a small % of stored goods from the global pool into a
  **relief reserve**. The reserve (a) improves Trading Post barter terms
  ([trader.ts](../../packages/citadel-sim-core/src/systems/trader.ts)) and (b) cushions
  starvation (drawn down before population starves —
  [immigration.ts](../../packages/citadel-sim-core/src/systems/immigration.ts) consumption/starvation path).
  Keeps the existing −8 happiness. Trade-off: pay happiness + goods now for a shock buffer + better trade.
- **CONSCRIPTION** — while a raid is active, idle/available villagers swell
  `defensiveStrength` ([siege-resolution.ts](../../packages/citadel-sim-core/src/systems/siege-resolution.ts)),
  **but their production pauses for the siege** ([production.ts](../../packages/citadel-sim-core/src/systems/production.ts)).
  Keeps the existing −5 happiness. Trade-off: defense up, economy down during the siege window.

## Decisions (grilled 2026-06-19)

- **Interlocking risk/reward** (chosen over simple flat modifiers and over cutting both decrees).
- Tithe = goods reserve improving trade + starvation cushion (**not** money — respects no-coin APR rule).
- Conscription = raid-time defense at the cost of paused production.

## Acceptance

- Enabling tithe visibly accumulates a relief reserve, improves barter terms, and buffers a starvation dip.
- Enabling conscription raises defense during an active raid while production drops for the siege duration.
- No coin/money is introduced anywhere.
- **Determinism gate:** sim-touching (consumption/trade/siege/production paths).
  Multi-seed `EXPORT=json` re-proof + phase3/phase4 tests; conscription interacts with
  raid timing, so re-prove siege tests — **ask before running**.
- `npm run typecheck` + targeted vitest green.

## Open tuning (resolve in-brief)

Tithe siphon %, reserve→barter ratio, starvation-cushion size; conscription defense factor + production-pause scope.
