# playtest-06 — `npm run test` fails ~3 tests at random, and none of them is broken: they time out

> **CLOSED 2026-09-20 — built, and the diagnosis sharpened while doing it.** Four tests, not three:
> Hollow's 2-seed family sim surfaced on the next full run. The adjacency test got the exact bounds
> pre-filter (**5207ms → ~1100ms**) and, in the process, revealed that its tile×tile scan could never
> fail — every region pair is already ≥2 apart at the bounds level, which
> `generate-world.property.test.ts` asserts across 30 seeds. It now asserts the cheap exact invariant
> on every pair and keeps the tile scan as a live net for bounds-adjacent pairs; proved still able to
> fail by perturbing a region's bounds. The other three got **declared** 20s budgets with a comment
> naming what makes them slow, per this spec's own instruction not to raise a global default.
> `npm run test` then passed **three consecutive uncached full runs**, and `npm run gates` passes 8/8.


status: CLOSED 2026-09-20 (see the note above; the original text below is unchanged) — a gate-reliability bug, found by running the full suite after the playtest fixes
created: 2026-09-20

## What happens

A full `npm run test` reports failures like:

```
FAIL src/world/bridge-graph.test.ts  > bridges never overlap an island (other than their endpoints)
FAIL src/world/walkable-grid.test.ts > no two island bodies are adjacent (≥2 Chebyshev …)
FAIL src/sim-host.malformed.test.ts  > never throws and starts no run for any junk frame
```

Run any of them **alone** and it passes. The message is not an assertion:

```
Error: Test timed out in 5000ms.
```

All three sit just above vitest's **default 5000 ms** per-test timeout on this hardware
(measured: 5207 ms, 6161 ms, 5203 ms), and **no workspace configures `testTimeout`** — a repo-wide
grep finds none, so every package is on the 5 s default. Under a full run the machine is busier, the
slowest tests cross the line, and *which* ones cross it varies.

Nothing is wrong with the code under test. The world-generation properties hold; the fuzz test does
leave the host inert. The gate is simply reporting load, not correctness.

## Why it matters more here than in most repos

[CLAUDE.md](../../../CLAUDE.md) and [status.md](../../wiki/status.md) are explicit that **there is no hosted
CI** — `npm run gates` is the whole enforcement story, and it "runs when a human remembers". A gate
that fails a few random tests per run is a gate people learn to re-run and then learn to ignore, and
the next real regression arrives dressed as the usual noise. This is the failure mode
[audit-06](2026-09-13-audit-06-ci-gate.md) worried about, arriving from the other direction.

It also silently taxes the constrained-hardware working style the corpus already documents: the
advice is to run the narrowest scope, and this makes the *broad* scope untrustworthy precisely when
it is most needed (before a commit that touched shared engine code).

## What to do

Two different problems wearing one error message; fix them separately.

**1. The adjacency test is quadratic-on-quadratic, and does not need to be.**
[`walkable-grid.test.ts`](../../../games/farm/sim-core/src/world/walkable-grid.test.ts) compares **every
land tile of every region against every land tile of every other region** — ~73 regions is 2 628
pairs, each a full tile×tile scan. It is the slowest test in the repo and it is brute force where a
cheap pre-filter is exact: if two regions' **bounds rects** are already more than 1 tile apart, no
pair of their land tiles can be adjacent, so the pair can be skipped without weakening the property.
Only bounds-adjacent pairs need the tile scan. Same assertion, a fraction of the work.

**2. The other two are legitimately slow, so say so in the test.**
`bridge-graph`'s multi-seed property sweep and `sim-host.malformed`'s junk-frame fuzz do real work
over many cases. Give **those tests** an explicit timeout (vitest's third argument) with a one-line
comment saying why, rather than raising the default globally: a blanket `testTimeout` would also hide
a future test that is slow *because something regressed*, which is information worth keeping.

**Do not** simply bump a global timeout and move on. The point is that a slow test should be either
fast or explicitly declared slow — never implicitly racing a default.

## Acceptance

- `npm run test` from a cold cache passes **three times in a row** on this machine.
- The adjacency test still fails if the property is violated — prove it by perturbing one region's
  bounds in a scratch edit and watching it fail, not by trusting the refactor.
- No global `testTimeout` is introduced; any per-test timeout carries a comment explaining what makes
  that test slow.
- Record the measured before/after duration of the adjacency test in the log entry, so the next
  person can tell whether it has crept back.

## Out of scope

The sandbox's low frame rates and the general slowness of `npm run test` here. This spec is only
about tests that **fail** for being slow.
