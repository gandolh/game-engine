---
title: "Citadel 15 — Day/night wash + night light pool"
created: 2026-06-19
status: open
tags: [citadel, render, atmosphere]
---

# Citadel 15 — Day/night wash + light pool

**Lineage:** tiny-world has time-of-day/weather; the directly-portable tech is **Farm Valley's**
day/night + seasonal grading (game brief 26) and the WebGPU tint/light passes (engine shader
wave 12–16) — a full-screen tinted overlay + a radial-gradient light pool where emitters glow.

**Target:** Citadel render only. **Render-only, zero determinism risk.** Any colour via `EDG.*`.

## Idea

Citadel shows the season as HUD text only; terrain is flat full-brightness rects regardless
of time or season. Add (a) a **seasonal/day tint wash** (winter-blue, dusk-warm) as an overlay,
and (b) a **night light pool** — radial glows on smith/bakery/chapel/market that warm the
surrounding tiles after dark. Derive a day-fraction from `tick % ticksPerDay` (already available).
Crib FV's day/night + light modules — **verify exact module names before reuse** (wiki may have drifted).

## Decisions to settle in-brief

- Seasonal tint only (cheaper, ties to the existing season system) vs full intra-day day/night cycle (richer; needs a daylight curve over ticks-within-day).
- Overlay ordering: how the winter wash composes with the fire orange-tint and disease mauve overlay (don't double up confusingly).
- Light-emitter list + intensities (which buildings glow, how bright) — small data table.

## Acceptance

- Winter-blue wash + warm night glows; the settlement reads as a living place across the day.
- Render-only; no sim/baseline change; `EDG.*` colours; typecheck + tests green.
