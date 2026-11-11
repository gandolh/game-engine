---
paths:
  - "engine/core/src/**"
  - "games/*/sim-core/src/**"
---

# Engine and sim-core

The sim is deterministic: a tick's output depends on the seed and the tick count, nothing else. The
commands and the full rule are in CLAUDE.md ("Determinism is load-bearing"); the reasons are in the wiki's
[architecture](../../corpus/wiki/architecture.md) and [decisions](../../corpus/wiki/decisions.md).

- All randomness goes through the seeded `Rng` and its `fork(label)`. Never `Math.random`, `Date.now`,
  `performance.now` or `new Date` in sim code. `engine/core/src/conventions.test.ts` scans for them.
- The scheduler's order is a data dependency. Read the comments in `sim-bootstrap.ts` before moving a
  system.
- Prove a behaviour-preserving change with a multi-seed `EXPORT=json` diff of `npm run sim`, and with
  `npm run sim:citadel` and `npm run sim:hollow`. `CHECK_DETERMINISM` only proves a seed repeats itself.
- Dependency direction: the engine never imports a game, and no game imports another
  (`engine/core/src/layering.test.ts`).
- Imports are extensionless, no `.js` suffix. Versions are pinned, no `^` or `~`.
- Only erasable TypeScript: no `enum` (an `as const` object and a derived union), no parameter properties
  (declare the field first, then assign it in the constructor, so the instance's key order stays).
- A `!` is a lint warning with a ceiling that only goes down (`npm run lint`). Don't add one: narrow with a
  guard.
