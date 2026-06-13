# Engine Briefs 12–16 — WebGPU shader wave (day/night wash · living water · weather parity · cloud shadows · foliage sway)

**Status:** Done (2026-06-12 improvement wave).

> Merged from briefs 12–16 on 2026-06-13; original specs in git history.

All five promoted from `wiki/shader-ideas.md` first wave. Render-only throughout — no sim code touched, no determinism impact. EDG-safe by construction: effects use alpha-only modulation of pre-parsed EDG uniforms or UV-displacement-only (the shader never synthesizes RGB).

---

## 12 — GPU day/night wash pass

- Moved the day/night + seasonal wash off the 2D overlay canvas (`overlay-2d.ts`) into a WebGPU full-screen pass in `tint.wgsl`: `mix(scene, washColor, washAlpha)`.
- Wash color enters as a pre-parsed EDG uniform (CPU converts `EDG.*` hex to floats; same pattern as `weather-pass.ts`).
- Shipped **before** briefs 13 and 15 — both caustics and cloud shadows need to compose *under* the tint.
- Removed the overlay wash job; verified remaining overlay-canvas duties still earned their keep.

## 13 — Living water: tiling break, noise warp, shore foam, caustics

- `water.wgsl`: cell-hash UV offset per `floor()`-grid cell kills the visible tiling repeat.
- Value-noise UV-warp (book ch. 11 hash + bilinear, ~20 lines WGSL) driven by the existing scroll-time uniform; flat scroll → undulation.
- Quantized shore foam: `step()`-thresholded noise band at the land/water boundary (coastal band from `water-depth.ts`), EDG-white at 2 alpha levels — no smooth gradients.
- Voronoi caustics (after brief 12): 3×3-tile Voronoi distance field, masked to shallow depth band, pre-parsed `EDG.cyan`/white at quantized alpha.
- All effects pure UV-displacement or alpha modulation — palette guard green by construction.

## 14 — Weather + particle shader parity polish

- `weather.wgsl`: snow circles via the SDF-circle + `fwidth` recipe from `particle.wgsl` (was squares); rain streaks tapered head→tail with `smoothstep` on v-coord; per-flake size/alpha variation via instance-index hash.
- `particle.wgsl`: proper 8-point star via polar `atan2` modulation (was L1 diamond); `pow()`/`smoothstep` fade-out easing per spark/smoke instance.
- `shadow-batch.ts` ellipses soft-edged via `smoothstep` over the ellipse SDF (~1px, `fwidth`).
- SDF ring splashes for rain: GPU expanding-ring SDF (`abs(length(uv)-r) < w`) per splash instance.
- Verified CPU particle path (`particles.ts` `splice(i,1)`, uncapped spawns): if still live post-migration → capped total, swap-with-last + `pop()`; if dead → deleted rather than fixed.

## 15 — fBm cloud-shadow pass + mist sheet

- New pass: scrolling 3–4-octave fBm `step()`-thresholded to soft blob masks, rendered as low-alpha darkening using the same pre-parsed EDG wash color as the night tint (brief 12 dependency).
- Quantized alpha (2–3 levels) for pixel-art friendliness. Time driven from one uniform, not `performance.now()`.
- Weather coupling is render-side only: reads the already-snapshotted weather state to scale cloud coverage and drift speed — no new sim fields.
- Optional fBm mist sheet (domain-warped, very low alpha over water/waterfall) shipped if cloud pass left obvious headroom.

## 16 — Vertex-shader wind sway for foliage

- `sprite-batch.ts`: added per-instance `swayPhase` + `swayAmp` attributes (default amp 0 = rigid; all existing callers unaffected).
- `sprite.wgsl`: vertex-stage shear about the sprite base — top vertices sheared, bottom pinned, so roots stay planted. Reuses the rotation-matrix plumbing already in the shader.
- Game-side (farm-valley): crops/trees/orchard sprites get small amp with phase derived from world position (deterministic, no `Math.random`).
- Bridge guard-rope sway: migrated off the CPU per-frame re-push **only if** the organic bridge motion (brief 83) reduces to shear; if not, left on CPU with a note. One-writeBuffer rule respected.
- Optional global wind-gust uniform (`windStrength`) multiplying all amps — one knob, whole-map gust waves.
