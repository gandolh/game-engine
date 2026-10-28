---
summary: Citadel's mouse and keyboard bindings and the precedence between them — the three ways out of a build tool (Cancel, Escape, a still right-click), what one Escape press closes, and the right-click vs right-drag rule.
updated: 2026-10-28
---

# Citadel — controls

Every binding below lives in [input.ts](../../games/citadel/client/src/main/input.ts) unless it
says otherwise. The in-canvas UI roots (HUD, Status, inspect, build bar, settings, new-game picker)
get first refusal on each event in a capture-phase listener; what they don't consume reaches the
world handlers. The HUD and controls are described in
[citadel-hud-and-overlays.md](citadel-hud-and-overlays.md).

## Mouse

- **Left** acts. In a build tool it places, drags a road or wall run, demolishes or upgrades. With no
  tool it inspects the building under the cursor, else follows the villager there, else closes the
  inspect panel or releases the follow.
- **Right-drag** pans the camera and keeps the current tool. The browser menu is suppressed.
- **A still right-click** leaves the build tool. "Still" means the pointer never got more than
  4 CSS px from the press (`STILL_RIGHT_CLICK_SLOP_PX`), so a pan that wanders back to its start is
  still a pan. A right release never commits a road or wall run; only the left release does.
- **Wheel** zooms toward the cursor.

## Leaving a build tool

Three ways, all through the same `setTool("none")` in
[build-controls.ts](../../games/citadel/client/src/main/build-controls.ts), so the mode label and
the bar highlight follow: the build bar's Cancel (X), **Escape**, and **a still right-click**. Leaving
mid-drag ends the road or wall run and drops its tiles: nothing is sent. If the left button is still
down, the click its release fires is swallowed, so it doesn't inspect whatever is under the cursor.
(Added 2026-10-28; before that only Cancel worked.)

## Escape: one layer per press

One handler, most recently opened layer first:

1. new-game picker up: nothing. It is not dismissable, and the capture handler stops every key.
2. settings modal open: close it, and only it.
3. a build tool selected: leave it.
4. inspect panel open: close it.
5. following a villager: release the follow-cam.

The tool goes before the inspect panel because the panel only opens from a no-tool click, so the
tool is always the newer layer, and it is the one that makes the next click do something. Until
2026-10-28 these were two listeners, and Escape with the modal open also closed the inspect panel
behind it.
