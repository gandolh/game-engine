---
title: "Engine audio subsystem + 2-3 test sounds wired into both games"
created: 2026-07-08
status: todo
tags: [engine, audio, sound, citadel, farm, client, render, juice]
---

# Engine audio support (+ prove it in both games)

> **➡️ Promoted 2026-07-08:** the dispatch-ready execution plan (shared API contract, three
> chunks, model routing, waves, gates) is now
> [engine brief 19](../briefs/engine/done/19-audio-subsystem.md). This todo remains the
> problem statement + design constraints + acceptance. Execution deferred to a later session.

## Problem

The engine has no audio at all (greenfield — a repo-wide grep for `AudioContext`/
`web audio`/`playSound` finds nothing but prose). Both games are silent. We want a
**generic engine audio subsystem** now, with a **small, real integration** in each game
(2-3 sounds apiece) that proves the pipeline works end-to-end — not the full sound design,
just enough to validate the plumbing. The full per-event sound palette for Citadel and Farm
comes later.

## Design constraints (load-bearing — do not violate)

- **Audio is a CLIENT/RENDER concern, strictly OFF the deterministic sim path.** It lives
  exactly where particles/toasts/juice live: the sim-cores stay audio-free so headless
  runs + determinism (multi-seed `EXPORT=json`) are untouched. **Never** call audio from
  `@farm/sim-core` / `@citadel/sim-core`, and never gate a sim decision on it. No
  `Math.random`/`Date.now` concern because it's not sim — but keep it out of the tick.
- **Engine stays game-agnostic.** New subsystem `engine/core/src/audio/` exported as a
  subpath (`@engine/core/audio`, added to [engine/core/package.json](../../engine/core/package.json)
  `exports`, mirroring `/render`, `/input`, …). The engine defines a generic
  `AudioEngine` + sound-id concept; each game owns its own event→sound MAP (no game names
  in the engine).
- **EDG32 is a colour guard only** — no bearing here, but any new UI (a mute toggle) still
  routes colours through `EDG.*`.
- **Browser autoplay policy:** a `WebAudio` `AudioContext` starts *suspended* until a user
  gesture. The engine must expose an `unlock()`/`resume()` the clients call on the first
  pointer/key (the Citadel/Farm clients already have global input handlers to hook).
- **Headless testability:** jsdom has no Web Audio. The `AudioEngine` must accept an
  **injected** `AudioContext`-like factory (or a thin interface) so its logic — registration,
  master volume/mute gating, voice cap, category routing — is unit-testable with a stub,
  no real browser. This mirrors how `PathfinderLike` / injected clocks keep other engine
  pieces headless-testable.

## Wanted

1. **`@engine/core/audio` — a generic `AudioEngine`** (Web Audio under the hood):
   - register a named sound (id → an `AudioBuffer` OR a procedural synth spec);
   - `play(id, opts?)` one-shot with per-voice gain + optional pitch/pan; routes through a
     master gain;
   - master `volume` + `mute`; a hard **voice cap** (drop oldest / skip when saturated) so a
     burst of events can't spawn unbounded nodes;
   - `unlock()` to resume the context on first gesture; safe no-op before unlock (queue-and-
     drop, never throw);
   - an **injected context factory** for tests; a real-browser factory as the default.
   - **v1 test sounds may be PROCEDURAL** (a short oscillator blip/chime/alarm synthesized on
     the fly) so we ship **zero binary audio assets** and dodge licensing/asset-churn while
     still exercising the full unlock→play→master-gain path. Buffer/file playback should be
     supported in the API (future real assets) but need not be wired to a committed `.wav`
     yet. (If the executor prefers 1-2 tiny CC0 `.wav`s to prove buffer decode too, that's
     acceptable — keep them <50KB and note the source.)
2. **Farm Valley wiring** ([@farm/client](../../games/farm/client/)): pick **2-3 events** that
   fire often enough to hear (candidates: new day / harvest / a trade or sale) and play a
   distinct sound for each, driven from the **same snapshot-event hook the UI already uses**
   (the client already diffs `recentEvents`; Farm's equivalent feed — confirm the exact
   field). Unlock audio on first input. A mute control (reuse existing settings UI if cheap).
3. **Citadel wiring** ([@citadel/client](../../games/citadel/client/)): same, off Citadel's
   `recentEvents` via the existing `newEventsSince` diff in
   [toast.ts](../../games/citadel/client/src/ui/toast.ts) (toasts already fire there — hang
   sound off the identical path). Candidates: building placed / raid-or-threat warning /
   promotion(level-up). Unlock on first gesture; a mute toggle (the settings modal exists).

## Notes / prior art to mirror

- Toasts are the template for "client reacts to sim events without touching the sim":
  [toast.ts](../../games/citadel/client/src/ui/toast.ts) `newEventsSince(prevLast, next)` returns
  only the newly-appended `recentEvents`; the render loop calls
  `toasts.push(e, performance.now())` per new event. Sound hangs off the very same loop.
- Render-side, off-sim precedent (RNG for jitter seeded off a constant, never the sim RNG):
  the particle/smoke/fire emitters in
  [citadel-fx.ts](../../games/citadel/client/src/render/citadel-fx.ts).
- Subpath-export + headless-injectable pattern: existing `engine/core/src/*/index.ts`
  subsystems + `package.json` `exports`.

## Acceptance

- `npm run typecheck` + `npm run test` green across all workspaces; new `@engine/core` audio
  unit tests (stubbed context) cover: registration, `play` routes through master gain,
  mute/volume gating, voice cap, and pre-unlock safe no-op.
- **Zero changes** to any `sim-core`; a Farm `CHECK_DETERMINISM` ×N and a Citadel determinism
  run stay byte-identical (audio is off the tick — this is the proof it didn't leak in).
- Live (`npm run dev` for Farm, `npm run citadel` for Citadel): after one click, the chosen
  2-3 events each produce an audible, distinct sound; muting silences them; no console errors
  from the autoplay-gate. (Browser sign-off is owed — a code-only session can't hear it.)
- Engine never imports a game; neither game imports the other; audio is only in client
  packages, never in a sim-core.
