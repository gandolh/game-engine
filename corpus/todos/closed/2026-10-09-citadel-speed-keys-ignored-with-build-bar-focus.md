# Citadel: speed keys ignored while the build bar has focus

status: closed 2026-10-28 — fixed: sim keys work whichever root holds focus; Space pauses (decided)
created: 2026-10-09
context: found during the 2026-10-09 README refresh. Bug brief only; nothing was fixed. The cause is
not pinned down: reproducing it is step one.

## What is wrong

While the build bar has keyboard focus, the 1/2/4 speed keys and Space do nothing. The same keys work
when nothing is focused. Since the build bar is where most players click first, this is the common case.

## Reproduce (confirm before changing anything)

1. `npm run citadel`, start a new game as host.
2. Click empty ground so nothing is focused. Press 2: speed changes. Press Space: pause toggles.
3. Tab into the build bar (or click a build-bar button) so one of its buttons holds focus.
4. Press 1, 2, 4 and Space. Observe whether the speed changes and whether Space pauses.
5. Repeat with the focus on the canvas path (dispatcher focus, no real DOM focus in the a11y mirror)
   and with a real mirror `<button>` focused. They take different branches below.

## Evidence (leads, re-checked against the code on 2026-10-09)

- The key handler: [`input.ts:536-553`](../../../games/citadel/client/src/main/input.ts#L536-L553). Its guard at
  `:542` returns early only when `uiDispatcher` or `siegeDispatcher` has a focused node. It does not
  mention `buildBarDispatcher`, so reading it does not explain why the bar blocks digits. Check
  whether another capture handler or the a11y mirror eats them.
- The capture-phase handler at [`input.ts:282-332`](../../../games/citadel/client/src/main/input.ts#L282-L332)
  forwards every key to `buildBarDispatcher.key()` (`:320`) and calls `stopImmediatePropagation` if
  anything reports `consumed` (`:323-331`). Space is consumed there when the bar has dispatcher
  focus (the dispatcher treats Space as "activate focused button",
  [`engine/ui/src/input/dispatcher.ts:357-363`](../../../engine/ui/src/input/dispatcher.ts#L357-L363)), so Space
  reaches the world handler never. That part may be by design (Space activates the focused button).
  Decide: should Space pause anyway, or is activating the button right? The brief the owner raised
  names it, so settle it and write the answer down.
- When a real mirror `<button>` in `#ui-a11y-buildbar` holds DOM focus, the handler returns at `:309`
  and the native button gets the key. The world handler at `:536` has no case for `e.target` being a
  mirror button, so check whether the target check at `:539` and the focus checks cover that branch.
- Origin: `843876f` (playtest-02) added these keys and its comment names only the HUD and Status panel.

## What to do

- Reproduce, then find which branch swallows 1/2/4. Fix so 1/2/4 work whichever HUD root holds focus,
  except in text inputs and while a modal is open.
- Make the Space decision above and keep it consistent across all five HUD roots (HUD, Status, inspect,
  build bar, settings).

## Files you OWN
- `games/citadel/client/src/main/input.ts`, `input.test.ts`

## Files you must NOT touch
- `engine/ui` dispatcher semantics (Space activating a focused button stays for everything else).
- `sim-client.ts` command path (`togglePause`, `setSpeedAndResume`); host gating stays.

## Acceptance
- With the build bar focused by Tab and by click, 1, 2 and 4 change the speed.
- Space behaves as decided, and the decision is in a comment.
- Typing in an input and the open settings modal still block the keys.
- Tests cover build-bar focus for both the dispatcher path and the mirror-button path.

## Outcome (2026-10-28)

**Reproduced** in Chromium (Playwright, SwiftShader WebGL, the Vite client, cozy start):

- Click empty ground, then 2 and Space: speed 2, pause toggles. Works.
- Click a build-bar button (House), then 4, 1, Space: all work. **The click path was never
  broken.** The mousedown capture moves DOM focus into the bar's mirror, the browser's own
  mousedown default then moves it to `<body>`, and the mirror's focus-out bridge blurs the bar's
  dispatcher. No root keeps focus, so the old guard let the keys through.
- Tab once, then 2, 4, Space: **nothing.** DOM focus sat on the bar's mirror "House" button.

**Cause.** One Tab is forwarded to every root's dispatcher, so it focused a node in the HUD,
Status and build bar at once; the mirrors' `setFocus` calls ran in turn and left DOM focus on the
build bar. The HUD mirror's focus-out bridge then blurred the HUD dispatcher, but the **Status
mirror is created without `onFocusNode`** (`hud-panels.ts`), so the Status dispatcher kept its
focused toggle for the rest of the session. The sim-key handler returned early whenever the HUD or
Status dispatcher had a focused node, so 1/2/4 and Space were dead after a single Tab. The guard
named the HUD and Status, not the build bar, which is why reading it did not explain the symptom.
On the dispatcher path the same stale focus also made Space collapse the Status panel.

**Fix** (`input.ts` only):

- The sim-key handler no longer looks at dispatcher focus. Only a text field, the settings modal
  and the new-game picker block the keys.
- The capture-phase handler no longer offers the sim keys (Space, 1/2/4, no modifier) to the
  widget dispatchers while the modal is closed.
- **Decision: Space pauses** wherever focus sits outside the modal; **Enter** activates a focused
  button, on the dispatcher path and on the mirror path. Reason: dispatcher focus is sticky and
  mostly invisible (one Tab focuses every root, a pointer miss never clears it, Status has no
  bridge), so "Space activates the focused button" meant "re-press whatever was focused last".
  Inside the settings modal Space keeps toggling the focused control. The decision is in the
  comment on the handler and on [citadel-controls.md](../../wiki/citadel-controls.md).
- On the mirror path, `preventDefault()` on the Space keydown stops the native `<button>` from
  also taking it as a click. Checked in Chromium: Space paused and the mode stayed `None`; Enter
  then picked House.

**Tests** (`input.test.ts`, 7 new, real dispatchers for the bar and Status): Tab-focused bar with
1/2/4, click-focused bar with 2, Space pauses without activating, Enter activates without pausing,
a real mirror `<button>` focused (2 and Space, Space's default prevented), a text input blocks, the
open modal blocks. Against the old `input.ts`, 3 fail (the two Tab cases and the mirror case); the
click case passes on the old code, which matches the browser.

**Browser check after the fix**: Tab then 2/4/1 set the speed and Space paused and resumed with
DOM focus still on the mirror "House"; Road clicked then 4/Space/2 worked; Tab, click the world,
then 2 and Space worked; with the settings modal open (14 mirror nodes) 2, 4 and Space did nothing,
Escape closed it, and 4 then worked.

**Not fixed, outside the owned files** (noted for a later spec, not filed):

- `hud-panels.ts:86` creates the Status mirror without `onFocusNode`, so the Status dispatcher's
  focus never clears from the DOM side. With this fix it no longer blocks the sim keys, but Enter
  on the dispatcher path still activates that stale Status toggle.
- One Tab moves focus in every root at once (each dispatcher keeps its own focus). A single focus
  order across the roots would need a host-level focus manager.

**Gates** (`npm run gates`, load average 15 to 25): typecheck, build, the four startup smokes and
pack-smoke passed; `@citadel/client` 597/597. The same two Hollow sim-core tests as on the
2026-10-28 no-mode-exit run hit vitest's 5 s timeout under load; they pass alone. Code: `93b00f4`.
