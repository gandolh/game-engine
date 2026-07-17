---
title: "Farm — tiered harbor contract sizes so mid-wealth farmers can commit"
created: 2026-07-16
status: closed (2026-07-17, `7d8bc7e` — size axis small/medium/large; non-hoarders commit on all seeds)
tags: [farm, sim, economy, harbor]
---

# Farm: tiered harbor contracts

Add smaller harbor contract tiers that mid-wealth farmers can take, keeping the
big ×2.0–3.2 hauls rare and hoarder-shaped.

## Why

Today only the hoarder personality ever reaches the harbor-contract commit gate
(open-questions "live-drama spare capacity", 2026-07-10) — the contract size /
reserve requirement excludes everyone else, so a shipped mechanic generates
drama for exactly one farmer in 21. Chosen 2026-07-16 over per-personality gate
tweaks; the full distance×freshness redesign (perishability, closed todo
2026-06-22) stays parked — this is deliberately the small version.

## Scope

- Introduce 2–3 contract size tiers (e.g. small/medium/large) where smaller
  tiers need less committed stock/reserve and pay a proportionally smaller (but
  still >1×) multiplier band. Large keeps today's economics.
- Personalities other than hoarder should plausibly reach the small tier's gate
  with their normal mid-game holdings — check `deliberate*` helpers actually
  consider them (adjust valuation inputs if the helpers hard-code the old size).
- Deterministic (tier offers via `Rng.fork` if randomized); no protocol shape
  breaks — extend, don't rework, the existing contract protocol.

## Acceptance

- Headless run on 3 standard seeds: at least 2 non-hoarder personalities commit
  a harbor contract within the 100 days (vs ~0 today).
- Big-tier frequency and payoff unchanged enough that the hoarder's niche
  survives (compare hoarder gold trajectory before/after via EXPORT=json).
- Economy page updated if the g/AP baseline moves; determinism green.

## Resolution (2026-07-17)

Additive `size` axis on HarborContract (small qty 2-3 ×1.3 / medium 3-5 ×1.6 / large = the
existing tier economics, formula-unchanged), rolled only at the always-available normal reputation
tier; silver/gold stay single-size large — the hoarder-shaped hauls. Zero personality-file changes
needed: the `have >= quantity` eligibility gate was already size-agnostic, so shrinking the ask is
what opens the gate. Evidence (probe-harbor-tiers.ts, 3×100d @1200 t/d WASM): conservative +
aggressive + opportunist commit on every seed across all three sizes; silver/gold commits remain
exclusively large; hoarder trajectory keeps rank. 856 tests green; deterministic (one extra
Rng.pick shifts which contracts draw — by design). Nits left: `deliberateHarborContract`'s dead
`reserve` param (pre-existing); medium rounds to large's rep at normal tier (cosmetic).
