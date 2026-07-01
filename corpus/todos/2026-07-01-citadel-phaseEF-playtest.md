---
title: "Citadel cozy-pivot playtest — Phase E villager mood (LIVE-VERIFIED) + Phase F motivation (mechanism verified) + A–I cozy-visual eyeball + a toast-copy UX finding"
created: 2026-07-01
status: partial
tags: [citadel, playtest, cozy-pivot, phase-e, phase-f, ux]
---

> **Run config (reproducible):** client seed fixed `0x1a2b3c4d`, solo Web-Worker sim
> (`cozyThreats:true`, `seedTown:true`, `deferThreatsUntilBuildings:6` — confirmed at
> [sim-worker.ts:59-81](../../games/citadel/client/src/worker/sim-worker.ts#L59)), system
> Chrome + WebGPU. Two runs: the skill's `play.mjs` default plan (SECONDS=200 SPEED=4,
> `reloads:0`, only a benign 404) + a focused `ef-probe.mjs` (scratch, git-ignored under
> `citadel-playtest-out/`) that places chapel+market+watchpost on the seeded house and reads
> the live snapshot's per-villager `mood` + per-house `lacks*`/`mood` back over ~12 samples.
> Both runs against the **uncommitted E/F working tree** (quiescent — no game-file edits mid-run).

## Phase E — per-villager mood: ✅ VERIFIED LIVE IN A REAL BROWSER

The whole E pipeline (sim reads a villager's HOME-house mood → surfaces it on
`VillagerSnapshot.mood` → renderer dims/slumps the sprite) is confirmed at the data layer:
in the `ef-probe` samples, **`villagerMood` tracked `houseMood` tick-for-tick** (68→64→63 in
lockstep as the served house's mood eased) — proving the villager living in a house carries
exactly that house's mood, and that it moves with the sim's asymmetric-drift mood (Phase B).
The default-plan run also rendered visibly varied villager sprites walking a living town
(`01-placed.png`, `99-final.png`). No page errors; determinism unaffected (read-only field,
digest byte-identical vs pre-E/F baseline — proven by `git stash` A/B on seed 0x1a2b3c4d).

- **Minor observation (not a bug):** villagers *in transit* between tiles occasionally
  sample `mood=null` in the probe read-back, snapping back to the real value next sample —
  a snapshot-timing artifact of reading mid-walk, not a mood-computation fault. Worth a glance
  if a future consumer treats `mood` as always-present at the exact walk frame.

## Phase F — motivation (inviting-gap pulse + contentment banner): mechanism verified, banner NOT flipped in-run

- **The predicate is correct.** `allHomesCovered` (computed client-side from the same per-house
  `lacks*` the sim writes) held **false** the whole probe run — *correctly*, because the seeded
  house only ever reached `{lacksFaith:true, lacksSafety:false, lacksGoods:false}` (mood ~63 =
  base 40 + ~2 met needs mid-ease). Faith never met: the chapel was placed 4 tiles away (well
  within `SERVICE_RADII.chapel=8`) but was **not road-connected / staffed**, so it provided no
  coverage. So F's banner *should not* have fired, and didn't — the mechanism is behaving, the
  scripted placement just never achieved full 3-need coverage.
- **The inviting-gap pulse renders.** `ef-01-served-town.png` shows the coverage overlay active
  with the orange catchment diamonds + gap markers — the Phase F pulse substrate is live.
- **The review fix is load-bearing here.** `uncoveredHouseTiles` now reads the sim's
  authoritative per-house `lacks*` (not recomputed market geometry), so the pulse and the
  `allHomesCovered` banner can never disagree about goods (which the sim gates on stockpile
  availability, not just market-in-range). See [coverage.ts](../../games/citadel/client/src/render/coverage.ts).
- **Not yet fully green:** the false→true banner edge was never triggered because no run
  produced a fully-covered house. **Acceptance still open:** a run that places
  chapel+market+watchpost **road-connected + staffed** in range of a house, watches mood climb
  to 100 and all three `lacks*` clear, and confirms the single "Every home is prospering." toast
  fires exactly once on the rising edge (and not on save-load of an already-happy town). The
  default `play.mjs` plan should be extended to lay roads to its service buildings (it currently
  places the economy chain but no connected services — none appeared in `byType`).

## A–I cozy visual — the town is finally alive, fed, and fire-recoverable across 200+ days ✅

The headline win the whole pivot was for: the default-plan run reached **Day 237 (deep winter),
Pop 5/12, Happy 37, Grain 1312** with `Threat:0 / Fire:none / Disease:none` at the end — a
calm, fed, self-recovering town that was **never reachable pre-pivot** (pre-B/H towns collapsed
to Pop 0 in ~10–20 days). Winter didn't cliff it (Phase H floor); a Day-32 disease outbreak
**ended on its own by Day 33** (Phase D demotion); the late-run toasts were the *gentle*
"not enough materials to upgrade" throttle, not a collapse. The served `ef-probe` town hit
**Happy 77**. This is the A–I acceptance step (a real-browser eyeball of the cozy result) —
**met**, with the two caveats below.

## P1 (UX) — threat/dip toast COPY reads pressure-game, undercutting the cozy contract

In the `ef-probe` run (fresh boot, past the defer gate, no well placed) the toast feed read:
*"a house caught fire!"*, *"fire spread to a bakery!"*, *"a villager starved (POP 0)"*
(`ef-01-served-town.png`, status bar "Fire: 2 building(s) burning!"). **The mechanics are
cozy-correct** — `cozyThreats:true` is wired (sim-worker.ts:68) and `cozy-threats.test.ts`
proves cozy fire *never razes* (the "spread" is a happiness-dent propagating, not destruction);
the POP 0 immediately recovered ("an immigrant arrived (POP 1)") — the known 1-house small-town
churn, not a spiral. **But the WORDING** ("caught fire!", "spread!", "starved") is alarming and
reads like the sharp pressure game, contradicting decision #3 (diegetic, calm) and #5/#9
(recoverable dip, never a loss). A player can't tell from the copy that nothing was actually
taken from them.

- **Finding type:** UX (copy/tone), not a mechanics bug.
- **Acceptance:** re-word cozy-path threat toasts to match the contract — a smouldering fire
  reads as a tended, recoverable event ("a hearth is smoking — a well nearby would settle it"),
  disease as "under the weather", a food dip as a gentle nudge, never "starved (POP 0)" /
  "spread!". Confirm the sharp wording only appears under `cozyThreats:false` (Challenge mode).
  Source: the event strings emitted by FireSystem/DiseaseSystem + the starvation event in
  immigration/economy. (P1 because tone is the cozy pivot's whole point; low code risk — copy.)

## P2 (tooling) — `play.mjs` still can't drive services or read HUD (carried from prior run)

- The DOM-scrape HUD timeline is still `null` (in-canvas-UI migration; the P2 filed in
  [2026-07-01-citadel-phaseA-playtest-verification.md](2026-07-01-citadel-phaseA-playtest-verification.md)
  — extend `__citadel` to expose the latest snapshot's `day/pop/happiness/tier/…` incl.
  **`allHomesCovered`**, so a harness can assert the banner edge without inferring it).
- The default plan places an economy chain but **no road-connected services**, so it can't
  drive coverage/happiness high enough to exercise Phase F. Extend the plan to lay roads to a
  chapel+market+watchpost in range of its houses (then F's banner becomes scriptable).

## Not in scope here
Fixing the toast copy or extending the driver — captured as P1/P2 above for a deliberate pass.
This todo records the E (verified) / F (mechanism verified, banner acceptance still open) /
A–I cozy-visual playtest result.
