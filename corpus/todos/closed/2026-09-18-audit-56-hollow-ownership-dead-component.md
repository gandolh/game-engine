# audit-56 — Hollow's `Ownership` component is read by nothing, yet silently gates reproduction

status: todo
created: 2026-09-18
context: found by the undone-work lens of the 2026-09-18 sweep. A dead component would be harmless;
this one is a query key, which makes it a trap.

## The gap

Every Hollow agent carries an `Ownership` whose `ownerId` is set to its own id at spawn and never read
again. `grep -rnw ownerId games/hollow` returns 6 hits, **all writes or type declarations**:
[`population.ts:118`](../../../games/hollow/sim-core/src/population.ts#L118) (`{ ownerId: 0 }` placeholder),
[`:148`](../../../games/hollow/sim-core/src/population.ts#L148) (`= spawned.id`),
[`reproduction-system.ts:183,209`](../../../games/hollow/sim-core/src/family/reproduction-system.ts#L183)
(the same pair), the interface, and one test assertion. Zero production reads.

[`components/ownership.ts:4`](../../../games/hollow/sim-core/src/components/ownership.ts#L4) says it:
*"self-owns its inventory (`ownerId === own id`); there is no transfer yet"*.

Inheritance — the feature it was a seam for — **did** ship, built on `inventory` instead:
[`family/lifecycle-system.ts:225,273`](../../../games/hollow/sim-core/src/family/lifecycle-system.ts#L225)
`handleDeath` → `inherit`.

## Why it is worse than dead code

[`reproduction-system.ts:117`](../../../games/hollow/sim-core/src/family/reproduction-system.ts#L117)
still **requires** `"ownership"` in its entity query. So the vestigial component is load-bearing for
the wrong reason: an agent spawned without it is silently sterile, with no error and no log line —
it simply never appears in the reproduction query. Anyone adding a spawn path (a scenario, a persona
fixture, a test, a future migration system) can produce a population that quietly stops breeding.

## The decision to make

1. **Delete it.** Remove the component, the two spawn writes, the interface, and — the point — drop
   `"ownership"` from the reproduction query. Cheapest, and loses a designed-for seam.
2. **Wire real transfer.** Give `ownerId` meaning: theft, gifting, and inheritance of *owned* goods
   rather than raw inventory. This is also the most plausible route to making the `steal`/`trade`
   verbs stop being dormant — a known Hollow limitation recorded in
   [`wiki/hollow-overview.md`](../../wiki/hollow-overview.md). Much larger, and it moves Hollow's
   behaviour.

Option 1 unless someone actually wants (2) soon. A seam kept "for later" that is simultaneously a
silent gate is the worst of both.

**Either way, fix the query.** Even if `Ownership` stays, reproduction should not depend on a component
it never reads — if a required-component invariant is wanted, make it explicit and loud.

## Files you OWN
- [`games/hollow/sim-core/src/components/ownership.ts`](../../../games/hollow/sim-core/src/components/ownership.ts)
- [`games/hollow/sim-core/src/population.ts`](../../../games/hollow/sim-core/src/population.ts)
- [`games/hollow/sim-core/src/family/reproduction-system.ts`](../../../games/hollow/sim-core/src/family/reproduction-system.ts)
- the affected Hollow tests

## Files you must NOT touch
- [`family/lifecycle-system.ts`](../../../games/hollow/sim-core/src/family/lifecycle-system.ts)'s
  inheritance — it works and is built on `inventory`; do not re-point it at `ownership` as a drive-by
- the `steal`/`trade` dormancy question — a balance call recorded in `hollow-overview.md`, not this
  brief

## Acceptance
- A test that an agent spawned **without** `Ownership` either reproduces normally (option 1) or fails
  loudly (option 2) — never silently sterile. That test is the actual deliverable.
- If deleting: `grep -rnw ownerId games/hollow` returns nothing.
- Hollow determinism re-verified: removing a component must not move the run (it is never read), so
  same seed → **byte-identical**, and if it is not, something did read it and the premise was wrong —
  report that rather than re-baselining. Small runs; ask before a full check.
