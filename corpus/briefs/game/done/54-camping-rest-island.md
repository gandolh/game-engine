# Game Task 54 — Camping / rest island

## Context

Part of the **"more islands"** theme (user request, 2026-06-09) — see
[brief 50](50-interactive-shrine-landmark.md) (shrine),
[51](51-heritage-sites-decorative-islands.md), [52](52-waterfall-island.md),
[53](53-remote-bar-gold-for-ap.md). The ask: a **camping area**.

## ⚠️ Overlap — read before building

The game already has a **rest mechanic**: at night, a farmer that reached HOME
sleeps and wakes with full AP (rested); one caught AWAY from home is flagged
`unrested` and wakes with only HALF the day's AP (the `SLEEP` FSM node, brief 27;
the rested/unrested halving lives in the morning wake — see
[ap.ts](../../../../packages/farm-valley/src/systems/ap.ts):104 and
[perceive.ts](../../../../packages/farm-valley/src/systems/perceive.ts)). So "rest"
exists; the gap a camping island fills is **resting AWAY from home without the
unrested penalty**.

That's the genuinely-new value: the far-south procedural farm band + farmers on
long resource/harbor/coral trips currently get penalized if night catches them
away. A campsite lets them count as "rested" remotely.

## Goal

Add a **camping island** (or campsites) where a farmer caught away at night can
sleep and wake RESTED (full AP) instead of unrested (half AP) — a strategic rest
waypoint for long-range farmers. Decorative tents/campfire + a real rest effect.

## Design

- New campsite region(s) + bridge in [regions.ts](../../../../packages/farm-valley/src/world/regions.ts),
  placed to serve far-from-home travel (e.g. near the southern band / harbor /
  fishing isles).
- **Rest logic:** in the night/sleep handling, treat a farmer whose night-tile is
  on a campsite region as RESTED (clear/skip the `unrested` flag) instead of the
  away-from-home penalty. Find where `unrested` is SET (the night/away check) and
  add "OR on a campsite" to the rested condition. Keep the home-sleep path
  unchanged.
- Optional cooldown/limit if needed for balance (camping every night shouldn't be
  strictly better than going home — consider a small cost, or leave it as a pure
  convenience for genuinely-distant farmers; grill the user if balance feels off).
- Sprites: tent + campfire (reuse `structure/*` / a small new frame; the campfire
  could reuse the forge-fire animation frames). Hover label.

## Determinism

Sim surface (changes the rested/unrested resolution → AP → downstream behavior).
`rng.fork(label)` never `Math.random`; verify `CHECK_DETERMINISM=1` ×3 seeds at
BOTH ticksPerDay 20 and 1200 ([project_mining_random_determinism] — the
rested/unrested halving directly scales a farmer's whole next day, so a bug here
ripples hard). The rest effect must be deterministic.

## Acceptance

- typecheck + test green; guard tests (region count, no-adjacency, BFS) updated; palette/atlas if touched.
- A farmer caught at night ON a campsite wakes rested (full AP), not halved; home-sleep + away-penalty paths otherwise unchanged.
- `CHECK_DETERMINISM` MATCH ×3 seeds @ 20 and 1200.
- A unit test: away-at-campsite ⇒ rested; away-not-at-campsite ⇒ unrested (the existing behavior).
- Relevant wiki pages + world-generation.md updated.

## Workflow

Opus plans, Sonnet executes ([feedback_subagent_workflow]). The rest-effect wiring
(finding where `unrested` is decided and extending it) is the real work — verify
the night/sleep logic location before editing. Do not commit until asked.
