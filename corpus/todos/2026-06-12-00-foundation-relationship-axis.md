---
title: "FOUNDATION (sim) — Unified relationship axis (trust ⊕ rivalry)"
created: 2026-06-12
status: open
tags: [sim, agents, relationships, foundation]
blocks: [ring-box-rivalry-fights, steal-from-npcs-friendship-penalty]
---

# FOUNDATION (sim) — Unified relationship axis

Collapse the two existing relationship dimensions into **one bidirectional axis**.
Negative end = rivalry, neutral = strangers, positive end = friendship — with
behaviors hanging off each end. This is a **refactor of existing systems** (removes
a redundancy), not a greenfield system.

## Why this is mostly already built (grilled 2026-06-12)

- **`trust` IS the axis.** Directional `trust.byId.get(peerId)`, range [0,1],
  **baseline 0.5 = "barely know each other"** (the neutral). `TrustSystem`
  ([systems/trust.ts](../../packages/sim-core/src/systems/trust.ts)) already moves
  it: accept +0.05, market trade +0.05, bean-gift large boost (up); decline −0.05,
  broken commitment −0.10 (down). Mutated via `applyTrustDelta` (clamped [0,1]).
- **`RivalrySystem` is a redundant accumulator** watching the SAME events. A
  `DECLINE` already lowers trust *and* separately raises a monotonic `rivalryScore`
  — duplication. **The monotonic accumulator + `RIVALRY_THRESHOLD` go away**;
  `RivalrySystem` becomes a **labeler that reads the trust axis** (still emits
  fresh-this-tick events for the feed/drama).
- Alliance label already = **mutual** trust ≥ 0.8.

## Decisions (grilled 2026-06-12)

- **Directional axis** (keep it). Derive labels/behaviors from it:
  - **Friendship / alliance = MUTUAL** (both directions ≥ 0.75; alliance ≥ 0.8).
  - **Rivalry / fight-inclination = ONE-SIDED** (if *my* trust toward you < rival
    cutoff, *I* may act against you — exactly the one-sided grudge the steal
    retaliation needs).
- **Bands:** rival `< 0.25`, neutral `[0.25, 0.75)`, friend `[0.75, 1.0]`,
  alliance = mutual `≥ 0.8`. **Calibrate the rival cutoff against a multi-seed run**
  to preserve today's ~2–5 rivalries per 100-day run (threshold-3 on the old
  accumulator won't map 1:1 to a trust cutoff — tune empirically).

## Behaviors off the ends

- **Friends share resources for less gold (NEW).** Peer-trade pricing currently
  *feeds* trust but does NOT *read* it
  ([peer-trade-policy.ts](../../packages/sim-core/src/agents/peer-trade-policy.ts)).
  Add a **trust-scaled discount** to peer trade offers (higher mutual trust → lower
  unit price).
- **Rivals tend to fight (NEW).** A co-located pair where one side is below the
  rival cutoff → a BDI challenge (street fight, or ring-box if a ring is present).
- **Ring-box bout → raises MUTUAL trust** (de-escalation / release valve) —
  replaces the original "reduce rivalry" framing (rivalry had no decrement path).
- **Street fight → lowers trust** (the act, plus a larger drop for looting).

## Migration surfaces (everything reading rivalry today)

`snapshot-builder/render.ts`, `event-feed/system.ts`, `drama.ts`,
`snapshot/panels.ts`, the relationship-matrix UI / game-over panels — all read
`ActiveRivalry`. They adapt to read the unified axis (friend/neutral/rival derived
from trust). Expect test churn in the rivalry/trust/drama tests.

## Acceptance

- One axis: rivalry is the low end of `trust`; the monotonic `rivalryScore`
  accumulator is gone; `RivalrySystem` derives labels from trust.
- Friend (mutual ≥0.75) / neutral / rival (one-sided <0.25) labels surface to the
  feed/drama/UI; rivalry frequency calibrated to ~2–5 per 100-day run (multi-seed
  before/after diff documented).
- Friends get a trust-scaled peer-trade discount; rivals get a fight inclination.
- Deterministic (3-day/3-seed fast diff byte-identical); behavior-change proven
  with multi-seed `EXPORT=json` diffs, not just a determinism check.
