# audit-27 — Hollow still hand-rolls the overlay the engine promoted *from Hollow*

status: todo
created: 2026-09-13
context: repo audit 2026-09-13 (`improve`). Trivial; near-zero risk. Good first slice for a junior executor.

## The gap

[engine/core/src/render/unsupported-notice.ts](../../engine/core/src/render/unsupported-notice.ts) exists
because Hollow did this properly first — its header says the pattern was *"lifted from Hollow, which already
did this properly"*. Farm, Citadel and MateQuest all now call the shared `showUnsupportedNotice`:

- [games/farm/client/src/main.ts](../../games/farm/client/src/main.ts)
- [games/citadel/client/src/main/boot.ts](../../games/citadel/client/src/main/boot.ts)
- [games/mathquest/client/src/main.ts](../../games/mathquest/client/src/main.ts)

**Hollow was never migrated.** It still runs its own `showRendererUnavailable`
([games/hollow/client/src/main.ts:262](../../games/hollow/client/src/main.ts#L262), wired at line 299) — a
near-identical ~25-line DOM construction.

## Failure scenario

The engine version's own comment states the message *"must not mention WebGPU… that advice is obsolete now
and was actively misleading"* — and Hollow's surviving copy is commented as showing a message "when the
WebGPU renderer can't start" (line 257). The exact staleness the shared helper was written to eliminate is
still live in the one game that inspired the fix. Any future improvement to the shared overlay — copy,
styling, accessibility — silently skips Hollow's users, who are the ones most likely to hit it (Hollow is
the 3D game, so it has the most ways for a renderer to fail).

See also [audit-22](2026-09-13-audit-22-webgpu-doc-drift-sweep.md), which covers the comment text; this spec
removes the duplicate function outright, which makes that half moot.

## Fix sketch

Delete `showRendererUnavailable` and call the shared helper with Hollow's palette:

```ts
showUnsupportedNotice(appEl, { text: HOLLOW_PAL.cream, background: HOLLOW_PAL.ink, border: HOLLOW_PAL.rust })
```

The shared version already takes colours as parameters for exactly this reason ("Colours are parameters, not
imports"), so the Apollo-family palette stays where it belongs and the engine stays EDG32-default. Pick the
actual role names from [hollow-palette.ts](../../games/hollow/client/src/render/hollow-palette.ts) rather
than the guesses above.

The two differ slightly in corner-vs-centre text alignment — adopt the shared behaviour rather than adding a
parameter for it, unless it looks genuinely wrong in Hollow, in which case say so.

## Files you OWN
- [games/hollow/client/src/main.ts](../../games/hollow/client/src/main.ts)

## Files you must NOT touch
- [engine/core/src/render/unsupported-notice.ts](../../engine/core/src/render/unsupported-notice.ts) — the
  shared helper is correct; do not add Hollow-specific options to it
- the other three games' call sites

## Acceptance
- `showRendererUnavailable` is gone; Hollow calls `showUnsupportedNotice`.
- The notice actually renders. Force the failure path (e.g. stub `createRenderer` to reject, or run where
  WebGL2 is unavailable) and confirm the overlay appears, is readable, and **does not mention WebGPU**.
  A notice nobody has seen render is not verified.
- Palette guard test green (no raw hex added).
- `npm run test -w @hollow/client` green.
