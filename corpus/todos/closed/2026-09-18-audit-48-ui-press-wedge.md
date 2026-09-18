# audit-48 — Releasing a UI drag outside the canvas wedges all pointer input until the next click inside

status: todo
created: 2026-09-18
context: found by the client/render lens of the 2026-09-18 sweep. Present identically in Farm and
Citadel; Farm's own camera code already does it the right way three files over, which is the tell.

## The gap

[`games/farm/client/src/ui/canvas/ui-host.ts:121-125`](../../../games/farm/client/src/ui/canvas/ui-host.ts#L121-L125)
claims the gesture on a UI-consumed `mousedown`:

```ts
if (consumed) { uiPressActive = true; e.stopImmediatePropagation(); syncFocusToMirrors(); }
```

and releases it only from a listener bound to the **canvas**
([`:130-145`](../../../games/farm/client/src/ui/canvas/ui-host.ts#L130-L145)):

```ts
canvas.addEventListener("mouseup", (e) => { …; uiGestureWasUI = uiPressActive; uiPressActive = false; }, { capture: true });
```

while the capture-phase `mousemove` swallows everything for as long as the flag is set
([`:147-159`](../../../games/farm/client/src/ui/canvas/ui-host.ts#L147-L159)):

```ts
for (const r of roots) r.dispatcher.pointerMove(x, y, btn);
if (uiPressActive) e.stopImmediatePropagation();
```

Citadel is the same shape —
[`main/input.ts:126`](../../../games/citadel/client/src/main/input.ts#L126), flag at `:64`.

Farm's **camera** drag, by contrast, binds its release to the window —
[`main/camera.ts:161`](../../../games/farm/client/src/main/camera.ts#L161):

```ts
window.addEventListener("mouseup", () => { isDragging = false; });
```

## The failure

Press on an in-canvas panel control (a slider, the wealth graph, a drag), move the cursor out of the
viewport onto the browser chrome or a second monitor, release there. No `mouseup` reaches the canvas,
so `uiPressActive` stays `true` — and from then on every `mousemove` is `stopImmediatePropagation`'d:
world hover tracking freezes, camera drag and pan are dead, and the next `mouseup` is swallowed too.
It only self-heals on a complete press-and-release back inside the canvas, which looks to the player
like the game randomly stopped responding and then randomly recovered.

## What to do

Move the ownership-clearing release to `window` in both hosts, keeping the capture-phase canvas
listener for *dispatch*. The invariant to establish: **a gesture that can start can always end**,
regardless of where the pointer is when the button comes up.

Watch the ordering — `uiGestureWasUI` is read by the world/camera path to decide whether a click was
the UI's, so whatever sets it must still run before the consumer reads it. A window-level listener
fires after a canvas capture-phase one; check that the handoff still holds rather than assuming it.

Consider `mouseleave` / window `blur` as belt-and-braces, and note this is the pointer-side twin of
[audit-47](2026-09-18-audit-47-keyboard-blur-stuck-keys.md) — same root shape, separate fix.

## Files you OWN
- [`games/farm/client/src/ui/canvas/ui-host.ts`](../../../games/farm/client/src/ui/canvas/ui-host.ts)
- [`games/citadel/client/src/main/input.ts`](../../../games/citadel/client/src/main/input.ts)
- their tests

## Files you must NOT touch
- `@engine/ui`'s `InputDispatcher` — the dispatch contract is fine; this is host-side gesture
  ownership. Do not push a window listener down into the toolkit.
- [`main/camera.ts`](../../../games/farm/client/src/main/camera.ts) — it is already correct and is the
  model to copy
- the capture-phase interception itself — swallowing world input *during* a genuine UI drag is the
  intended behaviour

## Acceptance
- A test (jsdom) that: `mousedown` consumed by UI → `mouseup` dispatched on `window`, not the canvas →
  a subsequent `mousemove` is **not** stopped, and world hover updates.
- The normal path is unchanged: press and release both inside the canvas still marks the gesture as
  the UI's, and the world does not receive it.
- Both games. Fixing one and leaving the other is the failure mode this brief exists to close — they
  drifted into the same bug by copying, and will drift again.
- Browser-verify in Farm: drag a panel control out of the window, release, confirm camera pan still
  works without clicking first.
