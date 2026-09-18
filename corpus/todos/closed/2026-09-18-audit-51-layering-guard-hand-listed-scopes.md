# audit-51 — The layering guard proves less than its name claims: hand-listed scopes, package-specifier-only regex

status: todo
created: 2026-09-18
context: found by the coverage lens of the 2026-09-18 sweep. This test enforces one of the repo's
locked conventions ("engine never imports a game; no game imports another game"), so what it *cannot*
see matters more than usual.

## The two gaps

**1. The tripwire only checks what it already knows about.**
[`layering.test.ts:88`](../../../engine/core/src/layering.test.ts#L88):

```ts
it("scans every game, tool and engine source file", () => {
  expect(scanned.length).toBeGreaterThan(500);
  for (const { root } of SCOPES) expect(scanned.some((f) => f.startsWith(`${root}/`))).toBe(true);
});
```

`SCOPES` ([`:25`](../../../engine/core/src/layering.test.ts#L25)) is a hand-written literal of 10 roots.
The test's name says "every game, tool and engine source file"; what it actually proves is "each of
the 10 roots I was told about is non-empty". A fifth game, or a new tool, is simply never scanned —
and `scanned.length > 500` still passes on the other nine. Given this repo went from two games to four,
a fifth is not hypothetical.

**2. The forbidden-import regex only matches package specifiers.**
[`:44`](../../../engine/core/src/layering.test.ts#L44):

```ts
return new RegExp(`(?:from\\s+|import\\(\\s*)["']@(?:${alt})/`);
```

A relative climb into a sibling game —
`import { x } from "../../../hollow/sim-core/src/needs"` inside Citadel — never matches, and TypeScript
resolves it on disk. The locked convention is broken and CI stays green.

## What to do

**Replace the hand-listed tripwire with a disk enumeration.** Read `games/*/*` and `tools/*` from the
filesystem and assert every discovered workspace has a matching `SCOPES` entry — so a new workspace
**fails the guard until someone classifies it**. That inverts the failure mode from "silently
unscanned" to "loudly unclassified", which is the whole point of a guard.

Then widen the regex to also flag relative specifiers that climb out of the current workspace into a
sibling game directory. Verify the false-positive surface before committing to a pattern — within-game
relative imports are everywhere and must not trip it, and `tools/*` legitimately import the game they
drive.

Consider whether the first gap deserves the same treatment in
[`palette.test.ts`](../../../engine/core/src/render/palette.test.ts) and the two `glsl-lint.test.ts`
copies, which use the same "walk from a root" shape. (The glsl globs were checked during this sweep
and **do** resolve, with their own tripwires — no action needed there, recorded so it is not re-checked.)

## Files you OWN
- [`engine/core/src/layering.test.ts`](../../../engine/core/src/layering.test.ts)

## Files you must NOT touch
- any game or tool source — this brief must find **zero** real violations today; if it finds one, stop
  and report it rather than fixing both in one change
- the `SELF` exclusion (the file names every scope in its own patterns, so it cannot scan itself)
- the dependency direction rules themselves — locked

## Acceptance
- **Demonstrate both gaps first**: (a) create a throwaway `games/scratch/sim-core/src/x.ts`, show the
  guard green, then red after the fix; (b) add a relative cross-game import in a scratch file, show
  green, then red. Remove both by hand afterwards (not `git checkout`).
- The guard passes on the repo as it stands — no existing violations.
- A new workspace on disk with no `SCOPES` entry fails with a message that says what to do.
- `npm run test -w @engine/core` green.
