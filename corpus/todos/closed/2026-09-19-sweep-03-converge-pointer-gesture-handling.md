# sweep-03 — Four games, four different answers to "the pointer was released off-canvas"

status: todo — small, and deliberately NOT done during the sweep that found it
created: 2026-09-19
context: the residue of the 2026-09-19 sweep, which fixed MateQuest's half of this and added the
missing engine primitive. Read [`wiki/engine-ui.md`](../../wiki/engine-ui.md) → *Pointer gestures that
end off-canvas* first.

## The state of play

One problem — a press that ends where the canvas cannot see it — with four different treatments:

| game | approach | verdict |
|---|---|---|
| **Hollow** | `canvas.setPointerCapture(e.pointerId)` on pointerdown ([`render3d/camera-input.ts`](../../../games/hollow/client/src/render3d/camera-input.ts)) | **Correct and cheapest.** The browser routes the release back to the canvas wherever it lands. Never was vulnerable. |
| **Farm** | hand-rolled `hostWindow` mouseup + blur, with `uiGestureWasUI` bookkeeping ([`ui/canvas/ui-host.ts`](../../../games/farm/client/src/ui/canvas/ui-host.ts)) | Works. Written before the engine had a cancel primitive. |
| **Citadel** | the same hand-rolled pattern, separately ([`main/input.ts`](../../../games/citadel/client/src/main/input.ts)) | Works. A second copy of Farm's bookkeeping. |
| **MateQuest** | `hostWindow` mouseup/blur → `dispatcher.cancelPointer()` | Fixed 2026-09-19; the shape the others should converge on. |

Farm and Citadel predate `cancelPointer()`, so each reconstructed the behaviour by hand — including a
`uiGestureWasUI` flag whose job is to stop the canvas seeing a click for a gesture that ended
elsewhere. That is state the dispatcher can now own.

## What to do

Converge Farm and Citadel onto `dispatcher.cancelPointer()`, deleting the bespoke bookkeeping where
the primitive subsumes it.

**Read this before starting: the reason this was not done during the sweep that found it.** Farm and
Citadel *work today*. This is a refactor of live, hard-won gesture handling whose bugs are subtle,
intermittent, and mostly invisible to unit tests — the exact profile of change that should not ride
along at the end of an unrelated pass. Do it as its own change, with its own verification.

1. Read both hosts' handlers fully before editing either. Farm's and Citadel's are similar, **not
   identical** — Farm's routes through the UI host with a widget/canvas distinction, Citadel's sits in
   the shared input module alongside camera drag and build-placement drag.
2. Replace the press-state bookkeeping with `cancelPointer()`. Keep anything the primitive does **not**
   cover — notably suppressing the canvas click for a gesture that ended outside, which is a
   host-level concern, not a dispatcher one. Do not delete a flag just because it looks redundant;
   check what reads it.
3. Consider whether either host should move to **pointer capture** instead, as Hollow already does.
   That is the better long-term answer and removes the window listeners entirely, but it is a larger
   change (mouse events → pointer events) and may interact with the camera-drag paths. Decide
   explicitly; either answer is fine if recorded.

## Acceptance
- Farm and Citadel behave **identically** before and after for: press-and-release-inside (click
  fires), press-and-release-outside (no click, nothing stuck), alt-tab mid-press, and drag-out-drag-back.
- Verify in a **real browser**, not only jsdom — this is gesture behaviour, and the bug it guards
  against is a visual stuck state. The 2026-09-19 sweep's method works and is cheap to repeat:
  screenshot the button row at rest, press, and after an outside release, and compare the crops
  pixel-wise. A control shot with the change disabled is what makes it evidence.
- No behavioural change to Hollow (already correct) or MateQuest (already converged).
- `wiki/engine-ui.md`'s table above updated to whatever the end state actually is.
