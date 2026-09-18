# audit-61 — The value-noise → fBm → hillshade stack exists four times, one a hand-maintained CPU mirror of a shader

status: todo
created: 2026-09-18
context: found by the debt lens of the 2026-09-18 sweep. The code admits the copying in its own
comments, which is what makes this actionable rather than a taste argument.

## The gap

Three games and one shader each carry the same noise/relief pipeline:

- [`engine/core/src/render/webgl2/shaders/cloud.frag.glsl:36-67`](../../engine/core/src/render/webgl2/shaders/cloud.frag.glsl#L36-L67) — `hash21`, cubic-Hermite `valueNoise`, 3-octave `fbm3`
- [`games/citadel/client/src/render/terrain-dither.ts:134-175`](../../games/citadel/client/src/render/terrain-dither.ts#L134-L175) — the same three functions **in TypeScript**, and `:126-131` says so: *"This is the engine's canonical noise, ported CPU-side **VERBATIM** from `engine/core/src/render/webgl2/shaders/cloud.frag.glsl`"*. Nothing keeps the two in sync.
- [`games/citadel/client/src/render/hillshade.ts:136-145`](../../games/citadel/client/src/render/hillshade.ts#L136-L145) — the central-difference gradient
- [`games/farm/client/src/render/ground-noise.ts:3-49`](../../games/farm/client/src/render/ground-noise.ts#L3-L49) and [`water-depth.ts:19-24`](../../games/farm/client/src/render/water-depth.ts#L19-L24) — byte-identical `hash2` bodies, in the same package
- [`games/mathquest/client/src/ui/map-screen.ts:143-205`](../../games/mathquest/client/src/ui/map-screen.ts#L143-L205) — `// --- height field (Farm fBm + Citadel hillshade, adapted to tile coords)`, with constants deliberately off by ±0.1 (`SLOPE_GAIN = 1.2; // hillshade slope weight (Citadel uses 1.3)`) and no record of why

## The cost

Editing the cloud shader's noise silently desyncs Citadel's ground bake from the sky it is meant to
match, and nothing fails. A tuning fix to the relief — the entire point of `hillshade.ts` — has to be
re-derived by hand in MateQuest. The shader↔CPU mirror is the sharpest edge: it is a correctness
coupling maintained by a comment.

## What to do

Extract the numeric core into `@engine/core/render`. It is genuinely generic — numbers in, numbers out,
no palette, no game type — so this does **not** violate the engine-never-imports-a-game rule.
`hillshade.ts` is already written to that contract (*"Everything here is PURE and returns NUMBERS … it
maps NOTHING to color"*), so it is the model.

The shader is the hard part and deserves an explicit decision: TypeScript cannot be imported into
GLSL. Either (a) keep both and add a test that samples the CPU port and the GLSL at the same
coordinates and asserts they agree — turning the comment into a gate; or (b) generate the GLSL noise
block from one source. (a) is much cheaper and probably right.

**Do not silently converge MateQuest's constants.** They differ by ±0.1 and may be a deliberate
art choice; find out, then either keep them as explicit per-game parameters or record that they were
drift.

## Files you OWN
- a new noise/relief module in `engine/core/src/render/`
- the five consumer sites listed above
- the CPU↔GLSL agreement test, if that route is taken

## Files you must NOT touch
- the GLSL's **colour** handling — locked: every colour from a palette-role uniform, no literals,
  guarded by `glsl-lint.test.ts`
- any game's palette mapping — extract the numbers, leave the colour decisions where they are
- [`games/mathquest/client/src/ui/map-screen.ts`](../../games/mathquest/client/src/ui/map-screen.ts)
  beyond the noise/terrain third. That file is an 850-line god module and splitting it is its own job.

## Acceptance
- One definition of `hash`/`valueNoise`/`fbm`/`hillshade`; the duplicates are gone.
- **Pixel-identical output** for all three games — this is a refactor. Capture before/after images
  (`npm run preview` for Farm; a browser shot for Citadel's ground bake and MateQuest's map) and
  compare. "Tests pass" is not the evidence standard for render work in this repo.
- If constants genuinely differ per game, they are explicit named parameters with a written reason.
