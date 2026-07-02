# Brief 102 — Citadel disease counterplay (playtest P3, the last untouched finding)

status: todo
source: [todos/2026-06-22-citadel-playtest-findings.md](../../../todos/2026-06-22-citadel-playtest-findings.md) §P3 — the only finding from that pass never addressed.

## Problem

Disease has no proactive lever: a healer exists (reactive coverage) but the player can't do
anything to *prevent* or *respond to* an outbreak beyond already-having a healer in range.
Under the cozy rules (Phase D: disease slows, always recovers, never kills) the dip is
recoverable by design — but it's also unengaging: nothing to decide, nothing to build.

## Direction (pick the smallest cozy-consistent set at session start)

- **Prevention levers**: e.g. well coverage reduces onset chance (wells already speed fire
  recovery — a natural sibling); crowding (houses per area) raises it, rewarding breathing
  room in layout. Both are placement puzzles, on-theme with decision #10 (terrain/placement
  IS the puzzle).
- **Response lever**: a staffed healer shortens an active outbreak visibly (if not already
  true, make the effect legible); possibly a one-shot "boil water" style town response with
  a real cost, if a lever beyond placement is wanted.
- **Legibility**: outbreak + recovery progress must read diegetically (the mood/dim system
  from Phase A is the channel), and the prevention effect must be visible at placement time
  (coverage ring precedent).

## Constraints

- Cozy contract: disease still never kills; all effects are throttles toward the floor.
- Deterministic: onset/recovery draws stay in their existing forked streams; new gates must
  short-circuit BEFORE any RNG draw when disabled (the defer-threats precedent) so existing
  baselines only move where intended. ⚠️ baseline moves by design where levers bite.

## Acceptance

- A player can point at something they built/placed and say "that's why the outbreak was
  short/never happened"; verified in a live playtest (playtest-citadel) not just tests.
- sim-core tests green; determinism MATCH ×3; source todo's P3 closed.
