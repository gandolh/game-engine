# Game Task 40 — Ambient Thought Bubbles + Highlight/Skip Control

## Context

Two findings from the spectator-sim research, bundled because they're both about **legibility + pacing of a watched run** and share plumbing:

1. **Decision legibility is shallow.** The brief-19 decision trace shows a 3-reason ring buffer (`farmer.decisionTrace.reasons`) for the **focused farmer only**, in the observer "why" block. The observable-BDI literature (arXiv 2110.12579) and RimWorld/The-Sims practice want decisions surfaced **ambiently and spatially** — a thought bubble over the agent's head showing its *current intention*, so a viewer scanning the map can read what everyone is doing without clicking. Farm Valley already renders a `indicator/meet` speech bubble over MEET'd farmers ([meet-indicator.ts](../../../../packages/farm-valley/src/systems/meet-indicator.ts)) — the rendering precedent exists.

2. **Watchers want to skip to the good parts.** Football Manager / Zengm / Civ4 AI Survivor all let the observer "sim to the next interesting moment." Farm Valley has speed/pause/step (brief 16) but no **highlight-jump**: there's no way to fast-forward to the next high-drama event. With brief 38's drama scores, this becomes easy.

## Goal

### Part A — Ambient intention bubbles
1. A small **thought bubble** over each AI farmer showing a glyph/short label for its **current intention** (planting / watering / heading to market / fishing / bidding / traveling). Reuse the meet-indicator rendering path (an `indicator/*` sprite + the snapshot field that drives it).
2. Driven from existing data — the farmer's current `Intention.kind` (and the brief-19 trace) is already known sim-side; map it to a bubble glyph in the snapshot builder. **No new sim mechanics.**
3. **Legible, not noisy** — show the bubble briefly on intention *change* (like the meet bubble's 10-tick window) or only for the focused farmer + on-change for others; tune so the map reads without becoming a wall of icons. Default to a clean, scannable result; state the choice in the panel/code comment.

### Part B — Highlight/skip control
4. A **"Skip to next highlight"** playback control: fast-forward the sim until the next event with `drama >= HIGHLIGHT_THRESHOLD` (brief 38) is produced, then return to normal speed and (optionally) snap the focus camera to the involved farmer(s). Implemented as a **worker control message** in the same style as brief-16's pause/speed/step (`WorkerInbound`), since the sim lives in the worker.
5. **Zoom-to-event**: clicking a feed entry (brief 20 feed panel) snaps the focus camera to that event's location/farmer (the feed entry needs to carry the involved farmer id — additive).

## Design decisions

- **Bubbles are render-side reflection**: the snapshot builder maps intention → an `indicator/*` glyph field on the sprite (mirror how the meet indicator is plumbed). No new ontologies, no sim coupling.
- **Skip-to-highlight is a worker control**, not a main-thread loop: the worker runs ticks until `EventFeedSystem` produces a high-drama event this tick, capped by a max-ticks safety (e.g. don't run past game-over; bail after N days). Determinism is untouched — it's the same `runOneTick()` body, just run faster and stopped on a condition. Pacing only.
- **Depends on brief 38** for drama scores. If 38 isn't merged, Part B can fall back to "skip to next day" or "skip to next auction/blight" using event *kind* — but prefer sequencing after 38.
- **EDG palette only** for any new indicator art (palette guard test).

## Files in scope

- `tools/atlas-builder/src/recipes.ts` — NEW `indicator/*` glyphs for the intention bubbles (or reuse existing tool/seed sprites at small scale). `npm run atlas` to bake; update the frame-count assertion in [render-systems.test.ts](../../../../packages/farm-valley/src/render-systems.test.ts).
- `packages/farm-valley/src/worker/snapshot-builder.ts` — map current intention → bubble glyph on the sprite (additive field on `SnapshotSprite`); carry the involved-farmer id on feed entries for zoom-to-event.
- `packages/farm-valley/src/worker/snapshot.ts` — the new sprite field + feed-entry farmer id.
- `packages/farm-valley/src/render-systems.ts` — draw the intention bubble (follow the meet-indicator draw path).
- `packages/farm-valley/src/worker/sim-worker.ts` — add a `skipToHighlight` control message handler (sibling of pause/speed/step); runs `runOneTick()` until a high-drama event or a safety cap.
- `packages/farm-valley/src/worker/sim-client.ts` — `skipToHighlight()` method.
- `packages/farm-valley/src/ui/playback-controls.ts` — a "Skip to highlight" button (+ a sensible hotkey that doesn't collide with hotbar 1–8 or P; pick from the free keys and document it).
- `packages/farm-valley/src/main.ts` — wire the feed-panel click → focus camera (reuse `setOnFarmerClick`/`applyFocusAndPan`).
- Matching `*.test.ts`: snapshot maps an intention to the right glyph; the skip control stops on a high-drama tick (unit-test the stop condition, not the worker).

## Files you must NOT touch

- `agents/**` — intentions are *read*, not changed.
- The determinism-load-bearing tick body (only add a stop-condition wrapper around `runOneTick()`).
- Engine source beyond what render-systems already uses.

## Determinism guarantee

Bubbles are render-only. Skip-to-highlight runs the **same** `runOneTick()` body — it only changes how many ticks fire per wall-clock interval and when to stop, exactly like brief-16 speed. Tick count still drives state. Run `CHECK_DETERMINISM=1 npm run sim` across `0xc0ffee/1/42` to confirm the snapshot-builder changes don't perturb sim outcomes (they shouldn't — builder is downstream of the tick).

## Acceptance

- `npm run typecheck` + `npm run test` green; palette guard + atlas frame-count test updated.
- `npm run dev`: AI farmers show a readable current-intention bubble; "Skip to highlight" fast-forwards to the next dramatic moment and focuses it; clicking a feed entry snaps the camera.
- Determinism MATCHes across the three seeds.

## Workflow

Sonnet executor. Sequence **after** brief 38 (uses drama scores). Read `MeetIndicatorSystem` + its render path, the brief-16 worker control messages in `sim-worker.ts`/`sim-client.ts`, and `playback-controls.ts`. Implement Part A and Part B (they can land in either order). Typecheck, test, run determinism, rebake atlas. Report files changed + test counts. Do not commit.
