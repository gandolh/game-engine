---
title: "Citadel — solo cold-start: founding window expires during boot, pop can never leave 0"
created: 2026-06-27
status: todo
tags: [citadel, sim, gameplay, immigration, boot, p0, live-finding]
---

# Citadel — founding window closes before the player can build (live solo client)

## Severity: P0 — a fresh solo game is unwinnable from an empty map

Distinct from the **resolved** pop-6 plateau in
[citadel-playtest-findings P0](2026-06-22-citadel-playtest-findings.md) (that was
*pop frozen at the founding size*; this is **pop frozen at 0** — the founder never
arrives at all in the live client).

## Finding (Playwright + real-GPU run, 2026-06-27)

Driving the live solo client (`npm run citadel`, in-browser Worker, WebGPU
confirmed, via the `window.__citadel` dev hook): starting from the **empty default
map** and building a fully road-connected farm→mill→bakery + houses,
**population stays `0` indefinitely** — verified `0/6` held from Day 26 → Day 98
(72 in-game days) with every production building reading `connected: true`.

## Root cause — boot latency vs a 6-day founding window

- The pioneer/founder only spawns inside the **founding window**:
  `foundingWindow = daysSinceStart <= floor(daysPerYear/4) + 2`
  ([immigration.ts:136](../../games/citadel/sim-core/src/systems/immigration.ts#L136)).
  With `DAYS_PER_YEAR = 16` ([sim-bootstrap.ts:58](../../games/citadel/sim-core/src/sim-bootstrap.ts#L58))
  that window is **6 sim-days** from `startDay`.
- `startDay` is set on `ImmigrationSystem`'s **first observed day**
  ([immigration.ts](../../games/citadel/sim-core/src/systems/immigration.ts)), i.e.
  sim day 0 — so the window is effectively **sim-days 0–6**.
- But the client runs the sim during page load / WebGPU renderer init: by the time
  the dev hook is even available and the sim can be paused, it is already at
  **~Day 15** (measured live — pause froze it at Day 15). The 6-day window has
  been closed for ~9 days before the player can place a single building.
- The only other immigration path needs a **strictly-positive bread surplus**
  ([immigration.ts:~142+](../../games/citadel/sim-core/src/systems/immigration.ts)),
  which is unreachable from a **0-population** cold start: no villagers → no farm
  worker → no bread → no surplus → no immigrants → no villagers. Hard deadlock.

So: the very first thing the sim does is open *and close* the founding window
before the player can build a connected settlement, and the surplus fallback can't
bootstrap from zero.

## Why the unit tests don't catch it

[economy.test.ts](../../games/citadel/sim-core/src/systems/economy.test.ts) drives
`bootstrapSim()` directly and enqueues `placeBuilding`/`placeRoad` **at tick 0**,
synchronously — so the buildings are connected *inside* the founding window and the
pioneer spawns. The tests never model the real client's multi-second boot delay,
so the live failure is invisible to them.

## Candidate fixes (pick during the brief)

- **Don't advance the sim until first interaction** — boot the Worker **paused**
  (or hold at day 0 until the client signals ready / first command), so the
  founding window starts when the player actually starts. Cleanest fix; needs a
  determinism check (the tick stream still has to replay identically).
- **Anchor `startDay` to the first player command** rather than the first observed
  sim day, so the window opens when building begins.
- **Make the cold-start bootstrap window-independent**: always allow the *first*
  pioneer to land for a player with `popCap > 0` and ≥1 connected unstaffed
  production building, regardless of `daysSinceStart` — then the surplus path can
  take over. (Lowest-risk; keeps determinism if gated on deterministic state.)
- Optionally widen `DAYS_PER_YEAR` / the window, but that only narrows the race,
  doesn't remove it.

## Notes / constraints

- Any fix touches **sim + determinism** — re-prove with a multi-seed
  `EXPORT=json` diff and `CHECK_DETERMINISM=1`, not just a single determinism run.
- Reproduce live with the `window.__citadel` dev hook (DEV-only,
  [main.ts:558](../../games/citadel/client/src/main.ts#L558)); the headless runner
  won't reproduce it because it has no boot delay.
- Confirm the fix also holds for the `?mp` server transport
  ([@citadel/server](../../games/citadel/server/)), which boots the sim differently.

## Acceptance

- From the empty default map in `npm run citadel`, a player who builds a
  road-connected farm→mill→bakery + house **gets a first villager and grows**,
  with no reliance on tick-0 timing.
- Determinism re-proved across ≥3 seeds (byte-identical `EXPORT=json`).
- A regression test models the boot delay (e.g. first command enqueued at a tick
  well past the old window) and asserts pop > 0.
