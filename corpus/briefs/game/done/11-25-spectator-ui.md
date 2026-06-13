# Game Briefs 11–20 + 25 — Spectator & observer UI wave

**Status:** Done.
> Merged on 2026-06-13; original specs in git history.

This wave builds the observer/spectator layer for a watch-don't-play game: camera control, ambient leaderboard, walking animations, encounter indicators, shop slate, playback controls, save/replay, seed picker, decision traces, event feed, and a layout fix that made the feed actually visible.

## 11 Focus camera

- Clicking a farmer row in the observer panel centers the camera and follows that farmer; "Reset view" clears focus.
- Free-pan (canvas drag) and scroll-wheel zoom (0.5×–3×) layered on top of focus.
- Focused farmer gets a canvas-drawn halo sprite (`iterateFocusHalo`); wired through `focusedFarmerId` parameter on `buildCanvasFrame` in `render-systems.ts`.

## 12 Live leaderboard

- `LeaderboardPanel` (bottom-left corner) updates every render frame: rank, name, personality chip, total value (`gold + unsold`).
- DOM-cache pattern mirrors `observer.ts` to avoid per-frame churn; reuses `leaderboard(world)` from `sim-bootstrap.ts`.

## 13 Walking animation

- Farmer sprite alternates between `farmer/walk-a` and `farmer/walk-b` frames every 2 ticks while `path` is set; reverts to idle when path clears.
- Frame selection extracted into `pickFarmerFrame(entity, tick)` helper in `render-systems.ts`; atlas rebuilt via `npm run atlas`.

## 14 MEET indicator

- `MeetIndicatorSystem` snoops `ONT_ENCOUNTER.MEET` via `bus.subscribeOntology` (option a, read-only); tracks `{ farmerId, peerId, expiresAtTick }` windows.
- `iterateMeetIndicators` emits a bubble sprite above each farmer for the indicator window; wired alongside the focus halo in `render-systems.ts`.

## 15 Slate billboard

- `SlateBillboardPanel` (bottom-right corner) renders today's shop slate: crop, unit price, `remaining/quantity` per offer.
- Pure DOM panel; reads `shopkeeper.dailySlate` from the world each render frame; same DOM-cache pattern as `observer.ts`.

## 16 Playback controls

- Pause/resume (spacebar), speed 1×/2×/4× (keys `1`/`2`/`4`), and step-one-tick (`.`) while paused.
- Implemented as wall-clock gating in `main.ts` — `scheduler.tick` is called 0/1/2/4 times per animation frame; `onRender` always runs so pan/zoom/focus stay live while paused.
- `PlaybackControlsPanel` DOM panel with callbacks; no engine changes needed.

## 17 Save / replay

- `run-descriptor.ts` added: `serializeRun` / `parseRun` round-trips `{ seed, maxDays, ticksPerDay }` through a base64 URL hash.
- "Share this run" button on the game-over screen writes `#run=<base64>` and copies to clipboard; boot reads the hash and restores the run.
- `inputLog` un-deaded (`void inputLog` removed); wired for future sim-affecting inputs.

## 18 Seed picker

- Home screen gains a seed text field (pre-filled with default) and a "Randomize" button (`Math.random` allowed in this UI-only handler).
- Chosen seed flows into `bootstrapSim`; displayed in the debug overlay during play and on the game-over screen.

## 19 Decision trace ("Why")

- Optional `reason: string` field added to `Intentions` component; each personality records a terse one-liner at every `intentions.queue.push(...)` call.
- `observer.ts` renders current intention, next intention, and the reason for the focused farmer; style is consistent across all four personalities.

## 20 Event feed

- `EventFeedSystem` (read-only snoop, registered before `PerceiveSystem`) captures `ONT_MARKET.TRADE_COMPLETED`, `ONT_SHOP.AUCTION_RESULT`, encounter ACCEPTs, weather shocks, and crop-loss events into a deterministic, tick-sorted, 30-entry ring.
- `EventFeedPanel` DOM panel (newest-first, capped) wired from `onRender`; same seed reproduces the identical feed.

## 25 Panel overlap fix

- Root cause: observer (`zIndex 9999`, `top:0 right:0`) and event feed (`zIndex 9997`, same anchor) stacked on top of each other — feed was hidden.
- Fix: `RightColumnContainer` — a single `position:fixed; top:0; right:0; display:flex; flex-direction:column` — holds observer on top, feed below; feed reflows automatically when the observer expands (focused-farmer "why" block).
- `observer.ts` and `event-feed-panel.ts` dropped their own positional anchoring; both mount into the shared column.
