# sweep-01 — "Determinism is load-bearing" is enforced by two tests, both in the wrong layer

status: todo
created: 2026-09-19
context: found by a read-only sweep on 2026-09-19, after the audit-38..63 queue closed. This is the
same shape as [audit-44](closed/2026-09-18-audit-44-palette-guard-skips-html-css.md),
[audit-45](closed/2026-09-18-audit-45-rng-golden-vector.md) and
[audit-51](closed/2026-09-18-audit-51-layering-guard-hand-listed-scopes.md) — a rule everyone believes
is enforced, which is not.

## The gap

Root [`CLAUDE.md`](../../CLAUDE.md) states the repo's most load-bearing invariant:

> **Determinism is load-bearing.** All randomness flows through the seeded mulberry32 `Rng` …
> **Never** use `Math.random()` or `Date.now()` in sim code.

Grep every test that guards it by reading source off disk:

```
games/citadel/client/src/render/ambient-crowd.test.ts
games/citadel/client/src/render/weather.test.ts
```

**Two files. Both in Citadel's *client render* layer.** There is **no guard over any of the four
`sim-core` packages** — the layer the rule is actually about. `@farm/sim-core`, `@citadel/sim-core`,
`@hollow/sim-core` and `@mathquest/sim-core` are unguarded; a `Math.random()` added to any of them
lands with a green suite, and the determinism check would still pass because `CHECK_DETERMINISM` runs
the same process twice with the same seed — which `Math.random()` does not survive, but only if the
draw actually changes the outcome in that particular run.

The rule is currently held up by **comments** (a dozen files say "never `Math.random`") and by
reviewer memory. Per personal memory, a raw `Math.random()` in a sim ACT path has bitten this repo
before.

Today there are **zero violations** — verified by grep across all four sim-cores plus
`engine/core/src/{sim,ecs,runtime}`. So this brief adds a guard that cannot currently fail, which is
exactly the point: it must be added *while* it passes.

## Two smaller siblings, same shape

[`CLAUDE.md`](../../CLAUDE.md)'s "Locked conventions" lists two more rules with **no** enforcement.
Both have zero violations today:

- **"No `.js` import suffixes."** Nothing checks. A single `from "./foo.js"` would work under Vite and
  break nothing loudly, then spread by copy-paste.
- **"Pinned versions. No `^`/`~` in any `package.json`."** Nothing checks. `npm install <pkg>` writes a
  caret **by default**, so this rule is one careless install from being broken silently — and the whole
  point of it is that the break is invisible until a rebuild produces different bytes.

## What to do

Add a path-scoped guard in `engine/core/src/` alongside
[`layering.test.ts`](../../engine/core/src/layering.test.ts) and
[`palette.test.ts`](../../engine/core/src/render/palette.test.ts) — the two existing repo-wide guards.
Copy their structure; it is already the house pattern.

1. **The determinism scan.** Every `.ts` under each `games/*/sim-core/src` plus
   `engine/core/src/{sim,ecs,runtime}`, excluding `*.test.ts`. Ban `Math.random`, `Date.now`,
   `performance.now`, `new Date(`. Report **file:line** for each hit, not just a count.
2. **Learn audit-51's lesson.** Do **not** hand-write the list of sim-core roots. Discover them from
   disk (`games/*/sim-core/src`) and fail if a game exists with no scanned root — otherwise game five
   is silently unguarded, which is the exact bug audit-51 fixed in the layering guard.
3. **Learn audit-44's lesson.** Assert the scan actually reached files (`expect(scanned.length)
   .toBeGreaterThan(N)`) with a message naming what went wrong, so a broken glob fails loudly instead
   of passing vacuously.
4. **Allow an escape hatch, but make it cost something.** If a legitimate exception ever exists, an
   `ALLOWLIST` with a mandatory reason string — same shape as `palette.test.ts`'s `ALLOWLIST_FILES`,
   which is empty and asserted empty.
5. **The two siblings** can be the same test file or a second one; they are cheap. For versions, walk
   every `package.json` in the workspace globs and fail on any dependency value matching `^[~^]`.

## Files you OWN
- a new guard test under `engine/core/src/`
- [`corpus/wiki/decisions.md`](../wiki/decisions.md) → *Build & verify gates*, to record that the rule
  is now enforced rather than asserted

## Files you must NOT touch
- **sim source** — there is nothing to fix; this brief adds the gate, not a repair. If the scan finds a
  real violation, that is a separate spec with its own determinism evidence.
- the two Citadel render guards — they are correct and stay; they cover a different layer.

## Acceptance
- The new guard **fails** when a `Math.random()` is temporarily inserted into each of the four
  sim-cores — demonstrate this per package, not once, or the per-root discovery is unproven.
- It fails when a `^` range is temporarily introduced into a `package.json`.
- It fails when its own scan is pointed at an empty directory (the vacuous-pass guard).
- `npm run test -w @engine/core` green with no source changes.
