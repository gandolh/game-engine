# Game Task 27 — Long Days + Intra-Day Agent Timeline (3b)

## Context

Today a sim "day" is **20 ticks at 20 Hz ≈ 1 real second**, and agents act **once per day**: a farmer leaves `WAIT_DAY` only on `DAY_START` ([systems/perceive.ts](../../../../packages/farm-valley/src/systems/perceive.ts):19-21), runs one `PERCEIVE → ACT → FINISH_DAY` pass, then idles. There is no within-day timeline, so "night" does not exist for an agent to be awake or asleep in.

The goal is a **Stardew-style long day**: 1 day = **5 minutes** (ticksPerDay 20 → 6000 at 20 Hz), within which agents wake, work across several slots reacting to live conditions, return home, and **sleep at night** — with a penalty for not resting.

## The architectural blocker (from impact analysis 2026-06-03)

> The FSM advances only on `DAY_START`, so "one deliberation per day" and "all per-day balance rules" are the same invariant.

With `ticksPerDay` 6000 and *no other change*, agents would idle for 5999 ticks and act once on tick 6000 — 300× slower, identical behavior. **Decoupling the deliberation trigger from the day boundary is the first and gating decision; it must land in this brief.**

## Design decisions (locked via grilling 2026-06-03)

- **Day = 5 min:** default `ticksPerDay` 20 → **6000**. `maxDays` stays **100** (≈ 8.3 real-hours for a full run; acceptable — runs are watched, not sat through, and playback speed + the determinism harness still apply).
- **Macro-economy stays on the day counter (untouched here).** Crop growth, weather rolls, seasons (25-day), the day-50 shock, auction cadence, CNP cadence, Aggressive `daysRemaining<=2` liquidation — **all remain day-denominated and unchanged**. Only *agent activity* goes intra-day. This preserves the entire shipped 100-day balance and determinism.
  - (Crop *watering*/death is a separate, intentional economy change — see Brief 29 — and is the one exception, specced on its own.)
- **Phased day as scaffold, with freedom within phases.** Divide the day by tick-fraction into **morning (wake) → work → evening (return home) → night (sleep)**. Phases gate *what's allowed* (no fieldwork at night). **Within the work phase, agents re-deliberate** on a sub-day cadence and react to the live environment (weather, desires, market state) — not a rigid pre-baked schedule. Phase becomes a new **belief** the `deliberate*` functions read.
- **Sleep is load-bearing.** "In bed at night" = the night phase forbids non-sleep intentions. An agent caught **away from home at nightfall** starts the next day with **half AP** (the AP ceiling itself is defined in Brief 28; this brief provides the *unrested* signal). Reuse the existing `penaltyPending` / `penaltyCapacity` path ([systems/ap.ts](../../../../packages/farm-valley/src/systems/ap.ts):61-65) where it fits, or a new explicit `unrested` flag.
- **Travel costs time, not AP.** Walking is AP-free (Brief 28) but consumes daylight: a trip occupies the slots it physically takes (the WASM pathfinder already moves farmers waypoint-by-waypoint over real ticks). This is the natural throttle on wandering — long trips eat the work window and threaten the sleep deadline.

## Implementation notes (from impact analysis)

- **Intra-day trigger:** introduce a sub-day tick event (e.g. `TIMESLOT_START` every K ticks) that re-arms the deliberation FSM, *or* loop deliberate→act multiple times within one pass. Touches [systems/day-clock.ts](../../../../packages/farm-valley/src/systems/day-clock.ts), `perceive.ts:19-21`, and the FSM union in [components.ts](../../../../packages/farm-valley/src/components.ts):13-18 (the currently-unused `DELIBERATE` state can be repurposed for an intra-day rest/sleep node).
- **AP refill cadence moves** out of `FinishDaySystem` ([systems/finish-day.ts](../../../../packages/farm-valley/src/systems/finish-day.ts):12) into a **sleep handler** (you get tomorrow's AP by sleeping). Coordinate with Brief 28.
- **Determinism / save format:** old shared run URLs are SAFE — `ticksPerDay` is field 3 of the `seed-maxDays-ticksPerDay` hash ([run-descriptor.ts](../../../../packages/farm-valley/src/run-descriptor.ts):27,50-56) and `main.ts:151` prefers the hash value over the default, so an old `c0ffee-64-20` link still replays at 20. The default change at `main.ts:33` only affects fresh launches. **If any new intra-day/sleep parameter affects the sim, it must be encoded in the run descriptor** — adding a 4th field is a format-version decision, and `parseRun` must tolerate the old 3-field form.
- **Tests/harness:** `tools/run-sim/src/index.ts:6` has its own `TICKS_PER_DAY ?? 20` default — update it (or set the env var) so the harness exercises 6000 (≈300× slower: 600k ticks/run). Several tests hard-code `20` locally (`sim-bootstrap.test.ts:53`, `shock.test.ts:7`, `snapshot-builder.test.ts:17`, `day-clock.test.ts`) — update those that should reflect the new default; **leave `run-descriptor.test.ts` fixtures** (they test the serializer).

## Files in scope

- `systems/day-clock.ts`, `systems/perceive.ts`, `systems/finish-day.ts` — intra-day trigger, phase beliefs, move refill toward sleep.
- `components.ts` — phase belief, `unrested` signal, FSM sleep node.
- `agents/{aggressive,hoarder,opportunist,conservative}.ts` — read the phase belief; deliberate within work slots; return-home + sleep behavior.
- `main.ts` / `CONFIG` — `ticksPerDay` default 6000.
- `tools/run-sim/src/index.ts` — default/flag for the new tick count.
- `run-descriptor.ts` (+ test) — if a new sim-affecting param is added, version the hash and keep 3-field parsing.
- Matching `*.test.ts` for the intra-day loop, phases, and the unrested penalty.

## Files you must NOT touch (denomination guard)

- `systems/crop-growth.ts` growth timing, `systems/weather.ts` roll cadence, season length, `systems/shock.ts` day-50 anchor, auction/CNP day cadences — **stay day-denominated** (except watering, which is Brief 29's deliberate change). Do not re-denominate them into ticks/slots.

## Acceptance

- A day visibly lasts ~5 minutes; agents move and act across it, return home, and sleep at night.
- An agent stranded away at nightfall starts the next day with half AP.
- Macro-economy outcomes for a given seed remain consistent with the day-denominated model; the determinism harness still MATCHes (at the new tick count).
- `npm test` / `npm run typecheck` green.
