# Citadel: no way back to "no mode" after picking a build tool

status: todo
created: 2026-10-09
context: found during the 2026-10-09 README refresh. Bug brief only; nothing was fixed.

## What is wrong

Once a player picks a build, Road, Wall, Upgrade or Demolish in the build bar, the only way back to
"Mode: None" is to find and click the bar's Cancel (X) button. Escape does nothing to placement, and
right-click does nothing either (it is the camera-pan gesture and never cancels). Genre convention is
that both leave the tool.

## Reproduce

1. `npm run citadel`, start a new game, pick a mode in the picker.
2. Click any build-bar button (for example Road). The mode label reads `Mode: Road (drag)`.
3. Press Escape. The label stays `Mode: Road (drag)`.
4. Right-click on the canvas without dragging. Still `Mode: Road (drag)`.
5. Click the Cancel (X) button. Now `Mode: None`.

## Evidence (leads, re-checked against the code on 2026-10-09)

- Escape handler: [`input.ts:495-500`](../../games/citadel/client/src/main/input.ts#L495-L500) only
  closes the inspect panel, else releases follow-cam. It never looks at `placementState.mode`.
  The follow-cam comment at `:444-448` and the settings Escape at `:516-520` are the other Escape
  handlers; neither touches placement.
- Right button: [`input.ts:337-345`](../../games/citadel/client/src/main/input.ts#L337-L345) starts a pan on
  `button === 2`. [`:372`](../../games/citadel/client/src/main/input.ts#L372) ends it. Nothing
  distinguishes a click from a drag, so a no-movement right-click does nothing.
  `contextmenu` is suppressed at `:466-468`.
- The exit that exists: `setTool("none")` in
  [`build-controls.ts:180-188`](../../games/citadel/client/src/main/build-controls.ts#L180-L188), wired to the
  bar's Cancel item ([`build-bar.ts:62`](../../games/citadel/client/src/ui/build-bar.ts#L62)).
  The fix is probably to call it from Escape (when placement is active, ahead of inspect/follow
  release, or after them, decide and document the precedence) and from a right-click that did not
  move.
- Mode label and highlight rebuild from `updateModeLabel()` (`build-controls.ts:150-161`).
- Unrelated Escape rule to preserve: the new-game picker is deliberately not dismissable
  (`input.ts:285-297`).

## What to do

- Escape in any placement mode (`place`, `road`, `wall`, `demolish`, `upgrade`) returns to `none`
  through `setTool("none")`, and cancels an in-progress road/wall drag cleanly (no half-placed run).
- A right-click that releases within a few pixels of where it was pressed does the same. A right-drag
  must still pan, and must not cancel.
- Decide the Escape precedence with the existing handlers (inspect, follow, settings modal) and record
  it in a comment next to the handler.

## Files you OWN
- `games/citadel/client/src/main/input.ts`
- `games/citadel/client/src/main/input.test.ts` (add the cases)

## Files you must NOT touch
- The new-game picker's non-dismissable behaviour.
- `engine/ui` dispatcher, other games' input handling.
- Build bar layout or art.

## Acceptance
- Escape and a still right-click each take the mode label from any tool back to `Mode: None`; the bar
  highlight follows.
- A right-drag still pans and leaves the tool selected.
- Escape with the settings modal open still closes only the modal; with the picker open it still does nothing.
- `npm test -w @citadel/client` passes with new tests for the three bullets above.
