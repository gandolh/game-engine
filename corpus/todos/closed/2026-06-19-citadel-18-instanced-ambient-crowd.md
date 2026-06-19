---
title: "Citadel 18 — Instanced ambient crowd layer"
created: 2026-06-19
status: open
tags: [citadel, render, atmosphere]
---

# Citadel 18 — Ambient crowd layer

**Lineage:** tiny-world-builder's `TinyCrowdLayer` — renders hundreds of ambient pedestrians
cheaply as a thin **procedural decoration layer**, explicitly **NOT ECS entities**. Farm Valley's
pooled `AmbientLayer` (game brief 68) is the proven template.

**Target:** Citadel render only. **Render-only; off-sim RNG; NOT sim entities (zero determinism impact).**

## Idea

A settlement with ~6 haulers looks dead. Add ambient pedestrians wandering between market /
well / gate, **density scaling by tier** (Hamlet few → Citadel many), driven by a thin procedural
layer that never touches the sim. Pooled + capped.

## Decisions to settle in-brief

- Confine pedestrians to roads (derive walkable from `roadGrid`/buildings — safer) vs any non-building floor tile.
- Do ambient crowds vanish during a siege (immersion) or keep wandering?
- Pool cap for a 96×96 world (FV caps particles at 512 — pick a budget).

## Acceptance

- Settlement reads as populated beyond the haulers; density tracks tier.
- Separate render RNG, never the sim sequence; pooled/capped; `EDG.*` colours; typecheck + tests green.
