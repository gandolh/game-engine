# MateQuest: move the immediate-mode layer into `@engine/ui`, retire `?imgui`

> **Done 2026-11-03.** The layer is `@engine/ui`'s `createImmediateUi`
> ([engine/ui/src/immediate/](../../../engine/ui/src/immediate/immediate.ts)), exported from the barrel.
> Its option types are renamed `ImmediateLabelOpts` and `ImmediateButtonOpts`, and it gains
> `evictAfter` (default 60 frames; an evicted key's pending click is dropped and it comes back as a
> fresh node). Nine tests on a sample screen cover:
> - node identity across frames;
> - `changed`;
> - the one-frame-late click, and a dropped click;
> - eviction;
> - the single root;
> - the disabled state;
> - fitting `MIN_VIEWPORT`.
>
> MateQuest's `combat-screen-immediate.ts`, its test, `ui/imgui/` and `?imgui` are deleted, and the
> eight helpers are module-private again. `?profile` stays, without the `shape` field.
>
> Checks:
> - `@engine/ui` 225 tests, MateQuest 109, and the typecheck all pass;
> - `npm run pack-smoke` passed, and the packed `@engine/ui` ships `dist/immediate/`;
> - in Chromium, `?profile` reported frames and a fight played: Attack, `5 - 2`, a correct answer hit.

> **Owner, 2026-10-28: move it, don't delete it.** The immediate-mode prototype moves into `@engine/ui` as an optional feature for a future game; MateQuest keeps its retained UI and `?profile` stays.
>
> **Owner, 2026-11-03: MateQuest's immediate combat screen goes.** After the layer moves to
> `@engine/ui` (with the eviction of unseen keys, its own tests on a small sample screen), delete
> `combat-screen-immediate.ts`, its test and the `?imgui` switch; keep `?profile`.
>
> Steps rewritten 2026-11-03 for the move. The original "delete everything" steps were not built.

status: todo
created: 2026-10-28 (rewritten 2026-11-03)
context: follow-up to the immediate-mode research
([spec](2026-10-27-mathquest-immediate-mode-research.md), findings on
[mathquest-ui.md](../../wiki/mathquest-ui.md)); the call is in [decisions.md](../../wiki/decisions.md) →
*UI — retained by default, immediate mode optional*.

## Why

The research's keyed immediate layer
([imgui/immediate.ts](../../../games/mathquest/client/src/ui/imgui/immediate.ts)) imports only
`@engine/ui`'s public API and keeps the dispatcher, the a11y mirror and the keyboard working. The
owner wants it kept as an opt-in engine feature for a future game whose screens are mostly dynamic
lists. MateQuest's second combat screen built on it is a copy to keep in step with the real one,
so it goes.

## What to do

1. **Move the layer.** `games/mathquest/client/src/ui/imgui/immediate.ts` →
   `engine/ui/src/immediate/` (an `index.ts` barrel plus the module), exported from
   [engine/ui/src/index.ts](../../../engine/ui/src/index.ts). Rewrite its header for its new home:
   what it is, when a screen should use it (a pointer to the decision), the keyed-node reason, and
   the one-frame-late click. Drop the "research prototype" wording.
2. **Evict unseen keys.** The prototype never evicts. Add eviction for keys not emitted for N
   consecutive frames (an option with a small default, e.g. 60). An evicted key's node leaves the
   cache, and a pending click on it is dropped. A key that comes back gets a fresh node.
3. **Tests in the engine**, on a small sample screen built in the test (a panel, a label, two
   buttons, one conditional subtree):
   - the same node object for a key across frames;
   - `changed` false on an identical frame and true on a text change or a structural change;
   - the click arrives on the frame after activation, and a click on a button not emitted on
     the next frame is dropped;
   - eviction after N unseen frames, and a key re-emitted before N keeps its node;
   - a key reused with a different node kind throws (or whatever the prototype does; keep it).
   Port whatever of the prototype's `combat-screen-immediate.test.ts` checks the layer rather than
   the combat screen.
4. **Retire MateQuest's copy.** Delete `combat-screen-immediate.ts`, its test and `ui/imgui/`.
   In `main.ts`, drop `USE_IMGUI` and its import. **Keep `?profile`** (`window.__mqProfile()`).
   Make the `combat-screen.ts` helpers exported only for the prototype (`HP_BAR_WIDTH`,
   `HP_BAR_HEIGHT`, `CHOICE_SLOTS`, `TOPIC_ACCENT`, `hpColor`, `drawTileFrame`, `drawPlatform`,
   `drawCloud`) module-private again where nothing else imports them (grep first).
5. **Corpus.** [mathquest-ui.md](../../wiki/mathquest-ui.md): the prototype section says where the
   layer went; [engine-ui.md](../../wiki/engine-ui.md) gains a short *Immediate mode* section.

## Acceptance

- `@engine/ui` exports the immediate layer; its tests pass (`npm run test -w @engine/ui`).
- No `imgui` under `games/mathquest/client/src/` and no `?imgui` handling in `main.ts`.
- `?profile` still exposes `window.__mqProfile()` in the browser, and MateQuest's combat plays.
- `npm run typecheck`, `npm run test -w @mathquest/client` and `npm run pack-smoke` pass (the
  barrel is part of the published package).
