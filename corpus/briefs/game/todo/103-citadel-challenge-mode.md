# Brief 103 — Citadel Challenge mode (unfreeze the sharp systems as an opt-in mode)

status: todo (design-first; untracked until now)
source: the cozy pivot's own promise — the sharp systems were frozen "for a future
Challenge/MP mode", not deleted: `cozyThreats:false` keeps the destructive fire/disease/raid
path byte-identical; `enableArmy`/`enforceTerritory` gate army/territory; `activeDecrees`
reads survive in frozen immigration/siege. See [wiki/citadel-overview.md](../../../wiki/citadel-overview.md)
and the Phase D/G entries in [wiki/status.md](../../../wiki/status.md).

## Why

All the machinery for a higher-stakes ruleset already exists behind flags and is
regression-guarded (`cozyThreats:false` test). Exposing it as a deliberate mode turns
maintenance debt into content: cozy stays the default solo experience; Challenge is the
"the fire can actually take your bakery" ruleset for players who want stakes (and the
natural MP ruleset).

## Scope

1. **Mode plumbing**: a `mode: "cozy" | "challenge"` bootstrap option mapping onto the
   existing flags (challenge = sharp threats + army + territory + …); save/load + MP
   room config carry it; solo UI offers the choice at new-game (in-canvas, minimal).
2. **Make sharp actually playable again** (it's been frozen since 2026-06-28): a playtest
   pass to find what rotted — note brief 97 chunk 4 must land first (sharp destruction
   currently leaks ghost workers), and the decree lever was purged in Phase G, so decide
   whether Challenge gets decrees back or the sharp systems get re-pointed at
   non-decree inputs (recommend the latter — don't resurrect purged UI).
3. **Balance sanity only** — this brief is NOT a full balance pass; it ships the mode,
   verifies a challenge run is playable start→sack-or-survive, and files findings.

## Constraints

- Cozy default path byte-identical (regression-guard both modes' baselines ×3).
- Depends on: brief 97 (chunk 4 ghost workers). MP interplay verified in brief 108's pass
  or a two-tab check here.

## Acceptance

- New game offers cozy/challenge; challenge run playable in a real browser (raid can sack,
  fire can destroy, army/territory active); cozy baseline unmoved; both modes MATCH ×3.
