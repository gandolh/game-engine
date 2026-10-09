# Citadel: speed keys ignored while the build bar has focus

status: todo
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

- The key handler: [`input.ts:536-553`](../../games/citadel/client/src/main/input.ts#L536-L553). Its guard at
  `:542` returns early only when `uiDispatcher` or `siegeDispatcher` has a focused node. It does not
  mention `buildBarDispatcher`, so reading it does not explain why the bar blocks digits. Check
  whether another capture handler or the a11y mirror eats them.
- The capture-phase handler at [`input.ts:282-332`](../../games/citadel/client/src/main/input.ts#L282-L332)
  forwards every key to `buildBarDispatcher.key()` (`:320`) and calls `stopImmediatePropagation` if
  anything reports `consumed` (`:323-331`). Space is consumed there when the bar has dispatcher
  focus (the dispatcher treats Space as "activate focused button",
  [`engine/ui/src/input/dispatcher.ts:357-363`](../../engine/ui/src/input/dispatcher.ts#L357-L363)), so Space
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
