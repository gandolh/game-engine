---
title: "Farm — tiered harbor contract sizes so mid-wealth farmers can commit"
created: 2026-07-16
status: open
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
