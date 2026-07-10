# Brief 103 — Citadel Challenge mode (unfreeze the sharp systems as an opt-in mode)

status: todo (design-first) — **approved 2026-07-10 (decision #13).** Challenge mode is the home of *every* sharp system: `cozyThreats:false` **and** the PvP armies that decision **#15** removes from cozy MP outright ([brief 112](112-citadel-cozy-mp-drop-armies.md)). After #15, Challenge is the **only** place `launchAttack` exists — so it must at minimum support MP. That makes this brief the frozen path's first real consumer, and the reason its two-branch test burden stops being dead weight.
**Shape settled by decision #19**: Challenge introduces **no new sim state**. It is a *preset* of the flat options the sim already takes and already persists (`cozyThreats:false`, `enableArmy:true`, no `seedTown`, no threat-defer), chosen by the caller — solo worker, MP server, or a client mode-picker. Challenge-solo and Challenge-MP fall out for free as different bundles. ⚠️ **Every mode-affecting option must be persisted in `CitadelSave`**, or `loadFromSave` replays the command log under different rules; two fields were already violating that invariant (fixed in `19d6d98`). See [citadel-decisions.md](../../../wiki/citadel-decisions.md).
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
