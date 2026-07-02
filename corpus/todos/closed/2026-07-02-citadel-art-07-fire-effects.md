---
title: "Citadel art-07 — fire effects (flame sprite + embers + glow, beyond the orange tint)"
created: 2026-07-02
status: done
tags: [citadel, client, render, art, fx, fire, particles]
depends-on: []  # independent of the silhouette/unit work; verified via art-06 showcase
scope: BRIEF-ONLY (no implementation yet — spec + acceptance)
---

# art-07 — Fire effects

## Why (code-grounded)

The user wants to **"test with fire effects too."** Today a burning building is conveyed by
only three cheap render-only cues — there is **no actual fire**:

- an **orange multiply-tint** on the building sprite
  ([quads.ts](../../games/citadel/client/src/render/quads.ts): `packTint(b.burning ? EDG.orange : …)`),
- a **dark soot/scorch wash + crack quads** ramped by burn time
  ([wear.ts](../../games/citadel/client/src/render/wear.ts) `wearOverlayQuads`),
- **grey chimney smoke** that keeps emitting from bakery/smith/woodcutter regardless of fire
  ([citadel-fx.ts](../../games/citadel/client/src/render/citadel-fx.ts) `CitadelSmoke`).

So a burning building looks *sooty and orange*, not *on fire*. There are **no flames, no
embers, no fire-lit ground glow, no fire-tinted smoke** — the engine already has a
`ParticleSystem` (used for chimney smoke + weather) that can carry them.

## Goal / acceptance

A burning building **reads as actively on fire at a glance**, cozily stylised (EDG32, not
gritty realism), deterministic, render-only:

1. **Flame body** — an animated flame licking up the burning building, either:
   - a small set of `fx/flame@0..N` recipe frames cycled on the render clock (like the mill
     sails / unit walk — reuse `unitFrameAt`-style cycling), stamped at the building's base/roof
     and scaled by footprint; OR
   - a dense upward EDG particle cone (`crimson`→`orange`→`gold`→`yellow` ramp) if the particle
     pass gives enough density. Prefer the **sprite-frame flame** for a controlled cozy read,
     with embers as particles on top.
2. **Embers** — sparse rising `gold`/`yellow` spark particles above the flame (short lifetime,
   upward + slight outward, gravity slightly negative), via the existing `ParticleSystem`
   (mirror `CitadelSmoke.emitPuff`, warm ramp). Capped like smoke so a town-wide fire doesn't
   swamp the pool.
3. **Fire-tinted smoke** — while burning, the plume goes **dark + warm-underlit** (ink/slate
   body with a `crimson`/`orange` base kiss) instead of the calm grey hearth wisp; heavier
   cadence. (Chimney smoke on a burning building should read as the fire's smoke.)
4. **Fire ground-glow** — a warm flickering **light-pool** under the fire (reuse the
   `pushLightPool` sprite-quad path used for dusk windows, but keyed to `burning`, warm-orange,
   flickering deterministically on the render clock) so the fire lights its surroundings at
   night — the strongest "this is dangerous and warm" cue.
5. **Ramp with burn time** — flame/ember intensity rises with the same `burningSince`
   render-clock the soot ramp already uses ([main.ts](../../games/citadel/client/src/main.ts)),
   so a fresh ignition flickers small and a long fire roars.

### Acceptance

- On the **art-06 showcase "all-burning" toggle**, every building shows a legible cozy flame +
  embers + warm smoke + ground glow, on-palette, at dawn/noon/dusk/night.
- The fire cue **wins over the `@lit` dusk glow** (already true: `lit = !b.burning && …` in
  quads.ts — keep that ordering; the flame/glow replaces the window glow).
- Pure/deterministic: flame frame + flicker + ember emission are render-clock functions with a
  render-side RNG only (never the sim RNG, never `Math.random` in sim-construable code) — the
  invariant `CitadelSmoke` already documents.
- Headless unit tests for the pure pieces (flame-frame selection, flicker curve, ember-emit
  cadence, fire-glow alpha vs burn time) — the pattern `wear.ts`/`citadel-fx.ts` already follow.
- Palette guard green (flame/ember/glow all EDG: `crimson`/`orange`/`gold`/`yellow` warm ramp,
  `ink`/`slate` smoke) · typecheck green · **browser-verified** via the showcase capture.

## Work

1. **Flame recipe frames** in a new `fx` set (or extend `fx.ts`) — a stylised EDG flame,
   2–4 frames, footprint-scalable; register in the atlas (unique names, recipes.test covers it).
2. **Fire emitter** — a `CitadelFire` sibling to `CitadelSmoke` (embers + fire-tinted smoke),
   capped, keyed by burning building, driven off `burningSince`.
3. **Fire light-pool** — extend the light-pool push to emit a warm flickering pool for burning
   buildings (independent of `nightFactor` — fire glows in daylight too, stronger at night).
4. **Wire into main.ts** alongside the existing soot loop (which stays — soot + flame compose).

## Constraints

- **Render-only, deterministic, EDG32** — no sim/determinism impact; the sim already owns the
  `burning`/`onFire` truth, this only visualises it.
- Cap particle emission (embers + smoke) so a many-building fire can't starve the shared
  `ParticleSystem` (512 cap) — same discipline as `CitadelSmoke`.
- Cozy-stylised, not realistic gore — warm storybook fire per the
  [style bible](../wiki/citadel-art-style.md).
- Keep the existing orange-tint + soot cues (they compose under the flame); don't remove the
  burn read that's already tested.

- **Final grade:** passes section F (fire effects) of the
  [asset critique rubric](../wiki/citadel-asset-critique.md), judged from `showcase-fire.png` +
  a live fire event in playtest-citadel.

## Out of scope

- Building/unit silhouettes → art-04 / art-05. The showcase harness that verifies this →
  art-06.
