# audit-47 — Held keys never release when the window loses focus, so Pip walks on after an Alt-Tab

status: todo
created: 2026-09-18
context: found by the client/render lens of the 2026-09-18 sweep. Small, and every player who ever
switches windows mid-walk hits it.

## The gap

[`engine/core/src/input/keyboard.ts:17-30`](../../../engine/core/src/input/keyboard.ts#L17-L30) —
`_pressed` is only ever emptied by a matching `keyup`:

```ts
private readonly _onKeyUp = (e: Event): void => {
  const code = (e as KeyboardEvent).code;
  this._pressed.delete(code);
  this._justReleased.add(code);
};
attach(target: Window | HTMLElement): void {
  …
  target.addEventListener("keydown", this._onKeyDown);
  target.addEventListener("keyup", this._onKeyUp);
}
```

There is no `blur` / `visibilitychange` / `pagehide` reset. A repo-wide grep for `"blur"` across
`engine/` and every `games/*/client/src` returns **zero** hits; the two existing `visibilitychange`
listeners ([`net/sim-client/client.ts:144`](../../../games/farm/client/src/net/sim-client/client.ts#L144),
[`main.ts:283`](../../../games/farm/client/src/main.ts#L283)) handle interpolation and juice resync and
never touch the keyboard.

Farm attaches it to the window ([`main.ts:89-90`](../../../games/farm/client/src/main.ts#L89-L90)) and
drives Pip from `isDown` ([`main/render-loop.ts:449-452`](../../../games/farm/client/src/main/render-loop.ts#L449-L452)).

So: player holds `KeyD` to walk right, Alt-Tabs (or clicks devtools, or a second monitor). The `keyup`
is delivered to the other window. `_pressed` keeps `"KeyD"`. On return the client is still sending
`moveX: "right"` to the server every frame, and Pip has been walking into the map edge the whole time.

## What to do

In `attach`, also register a window-level handler that clears `_pressed` on focus loss — and push each
cleared code into `_justReleased` so a consumer polling edge transitions sees a clean release rather
than a key that simply vanished. Remove it in `detach`.

Cover both signals: `blur` handles Alt-Tab and devtools; `visibilitychange` (when `document.hidden`)
handles tab switches and mobile backgrounding. `pagehide` is worth considering for the mobile case.

The `attach(target)` parameter allows an `HTMLElement`, but focus loss is a **window** concern — bind
the reset to `window` regardless of `target`, and note that asymmetry in a comment so it does not look
like a mistake later.

## Files you OWN
- [`engine/core/src/input/keyboard.ts`](../../../engine/core/src/input/keyboard.ts)
- its test

## Files you must NOT touch
- the two existing `visibilitychange` listeners in the Farm client — they own interpolation reset and
  juice resync; do not fold keyboard handling into them
- `render-loop.ts`'s movement code — the input primitive is what is wrong, not its consumer
- the mouse/pointer paths (see [audit-48](2026-09-18-audit-48-ui-press-wedge.md), which is the
  pointer-side equivalent and a separate brief)

## Acceptance
- A test that a key held across a synthetic `blur` reads `isDown === false` afterwards, and that the
  same key appears in `justReleased` for exactly one frame.
- Same for `visibilitychange` with `document.hidden === true`.
- `detach` removes every listener it added — assert the count, so a future added listener cannot leak.
- Verify in the real browser: hold a movement key in Farm, Alt-Tab, return, confirm Pip stops. A test
  can prove the primitive; only the browser proves the player-visible bug is gone.
