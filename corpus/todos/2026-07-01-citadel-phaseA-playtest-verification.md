---
title: "Citadel — Phase A playtest: per-house mood DATA verified live; VISUAL gated behind B/C/D; driver stale post in-canvas-UI"
created: 2026-07-01
status: partial
tags: [citadel, playtest, cozy-pivot, phase-a, ux, tooling]
---

> **Run config (reproducible):** client seed fixed `0x1a2b3c4d`, solo Web-Worker
> sim, system Chrome + WebGPU. Two focused scripts (scratch, under
> `citadel-playtest-out/`, git-ignored): `phaseA-check.mjs` (served-vs-unserved
> house contrast + live snapshot read-back) and `phaseA-zoom.mjs` (zoom to a
> high-mood house for the diegetic render). The skill's `play.mjs` default plan
> was also run (SECONDS=150 SPEED=4).

## What was verified ✅ (Phase A data pipeline — CONFIRMED correct, live)

Read back per-house `{mood, lacksFaith, lacksSafety, lacksGoods}` straight off the
live client snapshot (`window.__citadel.buildings()`), proving the sim → snapshot →
client path carries the Phase A signal:

- **Served houses** (chapel in range): `mood: 60`, `lacksFaith: false` — exactly
  base 40 + one met need (+20). A second run reached `mood: 80` with
  `lacksFaith:false, lacksGoods:false` (chapel + market/bakery + food all in range).
- **Unserved houses** (no service in range): `mood: 40`, all three `lacks*: true` —
  the neutral base, fully neglected.

The math matches [needs-happiness.ts](../../games/citadel/sim-core/src/systems/needs-happiness.ts)
to the number. `lacksSafety` stayed true in both runs only because the test
placement spaced the watchpost outside `SERVICE_RADII` — **not a bug**, a test-layout
artifact (faith + goods flipping is sufficient proof of the mechanism). No page
errors; WebGPU renders the iso world correctly.

## What could NOT be visually confirmed ⚠️ (the glow/dim/smoke contrast in-frame)

The diegetic **render** (warm glow / sprite-dim / hearth smoke) could not be
cleanly eyeballed as a thriving-vs-neglected contrast, because **the visual payoff
is gated behind cozy-pivot Phases B/C/D, which aren't built yet:**

- **Fire still ignites** (Phase D demotion not done) — the served high-mood house
  came back `onFire:true`; "2–4 buildings burning" recurred. Fire dents mood and
  burns the very house we wanted to photograph happy.
- **Pop starves to 0** (the pre-cozy economy; Phase B productivity-floor + Phase H
  not done) — towns collapse to Pop 0 within ~10–20 days, so a stable, content,
  glowing district never persists long enough to frame.
- Glow is **constant-warm v1** (subtle in daylight by design; strongest at night) —
  combined with the above, a single daytime frame of a collapsing town shows no
  obvious warm pool, which is *correct behaviour* for low-mood/burning houses, not a
  render fault.

> **✅ PRECONDITION NOW MET (2026-07-01):** Phases **B, C, and D have all shipped** — the
> productivity floor stops the spiral (B), the seeded alive-core cold open means a fed
> connected town exists from tick 0 (C), and threats no longer raze/starve + are deferred
> until the town grows (C+D). So a **calm, fed, fire-free glowing town is now reachable via
> legitimate play**. The Phase A visual re-eyeball (warm glow / mood-dim / hearth smoke
> contrast) is **unblocked** — run a `playtest-citadel` pass in a real browser to do it. This
> is the outstanding acceptance step for Phases A–D.

**Conclusion:** Phase A is mechanically sound and live-verified at the data layer;
its *cozy look* is only observable once a town can stay alive and happy — i.e. after
**B (happiness→productivity floor), C (forgiving cold open), D (threat demotion).**
This matches the build-order's own spine (A→B→C, D alongside B) and the
[playtest skill's](../../.claude/skills/playtest-citadel/SKILL.md) warning that a
thriving state isn't reachable via legitimate play pre-pivot. **Re-do the Phase A
visual eyeball after B/C/D land** (a calm, fed, fire-free town).

## P2 (UX / tooling) — playtest driver is STALE after the in-canvas-UI migration

The skill driver `play.mjs` scrapes the **DOM** HUD (`pop`/`happy`/`day`/`tier`),
but the 2026-06-30 DOM-overlay-removal moved ALL Citadel GUI in-canvas
(`@engine/ui`). So the timeline now logs `pop=null happy=null tier="" day=""` for
every tick, and `buildingCount` counts roads (`bld=439`, 431 of them roads) →
`outcome` is uninformative. The screenshots + `__citadel.buildings()` still work
(that's how this verification was done).

- **Finding type:** UX/tooling (the harness, not the game).
- **Acceptance:** `play.mjs` reads HUD state from `window.__citadel` (extend the dev
  hook to expose the latest snapshot's `day/season/pop/popCap/happiness/tier/
  stockpiles` — `currentSnapshot` already exists in
  [sim-client.ts](../../games/citadel/client/src/worker/sim-client.ts)) instead of
  DOM scraping; the road-laying step stops inflating `buildingCount` (count
  non-road/non-wall types, or report roads separately). Re-run → timeline shows real
  pop/happy/tier again.
- Also nice: a `__citadel.setZoom(z)` / camera-center dev hook so a visual harness
  doesn't have to fake mouse-wheel events to frame a building.

## Not in scope here
Fixing the growth/fire collapse — that IS the cozy pivot (Phases B/D/H), already
specced in [the build order](2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md). This
todo only records the Phase A verification result + the driver-staleness finding.
