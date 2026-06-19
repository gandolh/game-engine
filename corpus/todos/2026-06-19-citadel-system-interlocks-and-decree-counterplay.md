---
title: "Citadel — interlock hazards/economy + give decrees counterplay"
created: 2026-06-19
status: open
tags: [citadel, sim, gameplay, economy]
---

# Citadel — interlock hazards/economy + give decrees counterplay

Citadel's threat/economy systems run as parallel independent dials with few
interlocks, and decrees are one-way happiness debt with no repayment. Sim depth comes
from systems *reacting to each other* and from costs the player can mitigate. Three
related additions:

## Context

1. **Hazards don't interact with raids or each other.**
   [fire-system.ts](../../games/citadel/sim-core/src/systems/fire-system.ts) and
   [disease-system.ts](../../games/citadel/sim-core/src/systems/disease-system.ts)
   ignite/spread independently and don't talk to raids or the garrison. Add
   interlocks: raid `applyRaidDamage` has a chance to **ignite** a wooden building
   (siege → fire, making wells/firebreaks tactical); disease reduces conscripted
   garrison effectiveness (sick soldiers desert); a burning building suppresses
   adjacent buildings' output, not just its own. The fire system already clears the
   burning building's `workerCount` — extend the radius.

2. **Decrees are inescapable happiness debt.**
   [needs-happiness.ts:113-116](../../games/citadel/sim-core/src/systems/needs-happiness.ts#L113)
   applies a flat penalty per active decree every recompute (rationing −10, tithe −8,
   workHours −12, conscription −5) with no duration cap and no way to "pay it back."
   Overcommitting can spiral (happiness ↓ → emigration → less food → more emigration).
   Add **counterplay**: a short "festival" decree (costs stored bread, grants a
   happiness bump next day) so strain is a repayable loop, and/or auto-expiring
   decrees, and/or a stacking penalty so panic-stacking all decrees hurts.

3. **Trader is flavor, not strategy.**
   [trader.ts:56-60](../../games/citadel/sim-core/src/systems/trader.ts#L56) pushes
   three **hardcoded** offers (`grain 5→bread 2`, `wood 4→flour 3`, `bread 3→grain 8`)
   regardless of state — and several are strictly worse than the production chain, so
   there's no reason to trade. Add **scarcity-based dynamic pricing** (offers shift
   with the player's stockpiles) so trade becomes a real surplus/shortage decision,
   and optionally tie rates to the tithe relief reserve so that decree gains a
   legible payoff.

Each is a self-contained slice — they can land independently. All sim-side →
**deterministic**: every random offer/ignition/outcome goes through `state.rng.fork`.
Verify with the fast 3-day/3-seed `EXPORT=json` diff and the relevant
`SCENARIO=fire|disease|siege` headless runs.

## Acceptance

- At least one hazard↔raid (or hazard↔hazard) interlock exists and is observable in a
  headless scenario run.
- Decrees have a mitigation path (festival/duration/stacking) — strain is no longer
  permanent until stats passively recover.
- Trader offers respond to game state instead of being fixed constants.
- Determinism holds across seeds for every change.
