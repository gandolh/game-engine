---
title: "Citadel 16 — Weather particle FX (rain / snow / clouds)"
created: 2026-06-19
status: open
tags: [citadel, render, atmosphere]
---

# Citadel 16 — Weather particle FX

**Lineage:** tiny-world weather effects; directly portable is **Farm Valley's** weather/particle
parity (engine shader wave brief 14) + cloud-shadow pass (brief 15) — pooled, capped particle
systems with swap-remove.

**Target:** Citadel render only. **Render-only — MUST use a separate render-side RNG, never the sim sequence.**

## Idea

Season-keyed weather visuals: winter → snow, rainy spells → rain streaks, drifting cloud
shadows. Port FV's pooled particle approach (cap the pool, swap-remove dead particles). Reads
the season the snapshot already carries.

## Scope caveat (do not relitigate)

This is the **visual layer only**. Weather *events* with gameplay effects (drought halving
farm output, storms damaging buildings) were **explicitly parked** by the APR (decision #25 —
"weather events parked, not committed"). This brief does **not** add economic shocks; if those
are ever wanted they're a separate sim-side brief with its own grilling + determinism re-proof.

## Acceptance

- Season-appropriate weather visuals; pool capped + swap-removed; off-sim RNG (zero determinism impact).
- `EDG.*` colours; render-only; typecheck + tests green.
