# WebGL2 09 — switch all four clients + the unsupported-browser screen

status: TODO (dispatch to a Sonnet executor; controller = opus verifies)
created: 2026-08-18
design-of-record: [2026-08-18-webgl2-00-BUILD-ORDER.md](2026-08-18-webgl2-00-BUILD-ORDER.md) · tracker: [2026-08-18-webgl2-BUILD-STATE.md](2026-08-18-webgl2-BUILD-STATE.md)
wave: 4 · depends on: 08, 11

## Goal

The integration brief. Point every client at the single backend, replace the blank-canvas failure
with a real message, and **verify all four games in a real browser**. This is the brief where the
migration either works or doesn't — everything before it is untested-in-anger infrastructure.

## The four call sites

| File | Today | Becomes |
|---|---|---|
| [../../games/farm/client/src/main.ts](../../games/farm/client/src/main.ts) ~65 | `backend: "webgpu"` | no `backend` option |
| [../../games/farm/client/src/main/profile-export.ts](../../games/farm/client/src/main/profile-export.ts) ~39 | `backend: "webgpu"` | no `backend` option |
| [../../games/citadel/client/src/render/citadel-renderer.ts](../../games/citadel/client/src/render/citadel-renderer.ts) ~268 | `backend: "webgpu"` | no `backend` option |
| [../../games/mathquest/client/src/main.ts](../../games/mathquest/client/src/main.ts) ~140 | `backend: "canvas2d"` | no `backend` option |

Keep every `onBackend` callback (they log `"[render] backend:"` / `"[citadel render] backend:"`);
they now report `"webgl2"`.

**MateQuest is the one to watch.** It is the only game that has been running on **Canvas2D**, so it
is the only one whose rendering actually changes behaviour rather than changing implementation. It
uses `beginFrame`/`endFrame`/`pushUI` and — per its own `vite-env.d.ts` comment — explicitly asked
for `"canvas2d"` (no WebGPU). It has never rendered through a GPU backend at all. Expect the
problems here, not in Farm.

## Stale comments to fix (they will mislead the next reader)
- `games/mathquest/client/src/vite-env.d.ts` ~17 — explains the canvas2d choice.
- `games/citadel/client/src/main/boot.ts` ~96–99 — *"Citadel is WebGPU-only at runtime — if WebGPU is
  unavailable this throws and the surface stays blank"*. Both clauses become false.
- `games/citadel/client/src/render/citadel-renderer.ts` ~4, ~247, ~252, ~782 — "WebGPU backend, forced".
- `games/citadel/client/src/render/quads.ts` ~224, ~447 — "both backends" / the OverlayFn-inert note
  (resolved by brief 05).
- `games/citadel/client/src/main/render-loop.ts` ~571, `citadel-fx.ts` ~11, `terrain-dither.ts` ~29,
  `weather.ts` ~15 — all say "the WebGPU backend".

Grep `-i webgpu` across `games/*/client/src` and fix every hit. A comment naming a deleted backend
is how a wiki drifts, and this repo's own lint workflow calls that out.

## The unsupported screen

Add a shared helper in `@engine/core` — `renderUnsupportedNotice(canvas, message)` or similar — and
use it in Farm, Citadel, and MateQuest when `createRenderer` throws. **Lift the pattern from Hollow**,
which already does this correctly: `onRendererUnavailable` shows an on-screen box, and *everything
non-render keeps running* rather than dying with an unhandled rejection
([app.ts](../../games/hollow/client/src/render3d/app.ts) ~205–223,
[main.ts](../../games/hollow/client/src/main.ts) ~466 for the overlay convention).

Requirements:
- Message text: plain, actionable, **no `chrome://flags`** and no WebGPU mention. WebGL2 has been
  universal since ~2017, so the realistic cause is disabled hardware acceleration or a VM — say that.
- Colours from the owning game's palette roles (`EDG.*` / `CITADEL_PAL.*` / `MATE_PAL.*`), never a
  raw hex. The palette guard test is **per-scope** and will fail the Citadel/MateQuest files against
  their own palettes.
- No unhandled promise rejection, and no blank canvas with a silent console error.

## Verification — the actual deliverable

The controller runs this; the executor prepares it. **Green tests are not acceptance here** — the
standing project lesson is that green subagent tests have twice hidden inert features (dead economy,
inert hazards), and this migration's whole failure mode is "compiles, renders nothing."

Launch and *look at* each game:
- `npm run dev` — Farm Valley: terrain, water, sprites, shadows, day/night wash, clouds, weather,
  hover tooltips, hotbar, Pip, and the text-heavy panels. Then `?profile` and read `fps` /
  `frame` / `ui.flush` against the recorded baseline (real-GPU: fps ~99, frame ~5 ms,
  `ui.flush` ~5.2 ms at ~1,950 quads — [../wiki/performance-measurements.md](../wiki/performance-measurements.md)).
- `npm run citadel` — terrain bake, iso projection, roads/bridges, 3D-mesh buildings, resource HUD,
  build bar, siege HUD, inspect panel, cloud/haze overlay.
- MateQuest — combat scene, quiz problem window, map, all in-canvas UI and Romanian diacritics.
- Hollow — the cozy town (brief 11's screenshot, re-confirmed in the assembled build).

Capture a screenshot per game into the tracker. **Ask the user before running anything heavy** —
constrained hardware; no determinism/EXPORT runs.

## Out of scope
- Deleting `webgpu/` (brief 12) — it must stay until this brief's verification passes, so a
  regression can be diffed against a working reference.
- Fixing pre-existing visual bugs unrelated to the backend. Note them for the tracker instead.

## Acceptance
- `npm run typecheck` clean across the whole workspace (this is the brief that closes brief 08's
  intentional four failures).
- `npm run test` — **full repo suite, once.** This is a milestone; the narrow-scope rule is relaxed
  here by design.
- `grep -rin webgpu games/*/client/src` returns nothing but genuinely historical notes.
- Four screenshots, one per game, in the tracker, plus the `?profile` numbers for Farm.
- A one-paragraph honest report of anything that looks *worse* than the WebGPU build. Do not round
  "slightly different" up to "parity" — brief 12 deletes the reference implementation on the strength
  of this report.
