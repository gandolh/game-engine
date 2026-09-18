# audit-45 — The seeded Rng has no golden vector, so every determinism gate compares the implementation to itself

status: todo
created: 2026-09-18
context: found by the coverage lens of the 2026-09-18 sweep. This is the load-bearing primitive of the
whole repo — "determinism is load-bearing" is the first line of the sim section in
[`wiki/decisions.md`](../../wiki/decisions.md) — and nothing pins its output.

## The gap

All 10 tests in [`rng.test.ts`](../../../engine/core/src/runtime/rng.test.ts) are **self-referential**:
two live instances of the same code compared against each other.

```ts
it("same seed produces identical sequences", () => {
  const r1 = createRng(42);
  const r2 = createRng(42);
  for (let i = 0; i < 10; i++) expect(r1.nextU32()).toBe(r2.nextU32());
});
```

There is not one hardcoded expected `u32` anywhere in the repo. So if the mulberry32 constant
`0x6d2b79f5` ([`rng.ts:34`](../../../engine/core/src/runtime/rng.ts#L34)), the FNV-1a constants in
`fork`, or — worst — the `this.nextU32()` call **inside** `fork` that advances the parent stream
([`rng.ts:60`](../../../engine/core/src/runtime/rng.ts#L60)) were changed or "tidied away", every test
still passes.

`CHECK_DETERMINISM=1` does not help: it runs the same seed twice in the same build and compares
fingerprints. It proves **reproducibility**, not **stability**. Those are different properties and
only one of them is currently tested.

## Why it matters more here than in most repos

`Rng.fork(label)` consuming a parent draw is a documented, order-sensitive property — the corpus
records that reordering fork calls changes a run. Every committed Citadel save replays through it,
every tuned Farm scenario and every balance number in [`wiki/economy.md`](../../wiki/economy.md) is
downstream of it. A silent change to the stream re-baselines all of them at once, and nothing goes red.

## What to do

Pin golden vectors — hardcoded expected values generated **once** from the current implementation and
committed as constants:

- the first 8 `nextU32()` values for a fixed seed
- the first 4 values of `createRng(1).fork("pathfinder")`
- one nested fork, since derivation order is the fragile part

Plus one explicit behavioural test for the property a comment currently carries alone:

```ts
const r = createRng(9); r.fork("a");
expect(r.nextU32()).not.toBe(createRng(9).nextU32());   // fork advances the parent
```

Write in the test file **why** these numbers are hardcoded and what it means when they fail — a future
reader must understand that changing them is a deliberate re-baselining of the entire repo, not a
test fix.

Also untested and cheap while you are here: `Rng.int`'s `maxExclusive <= minInclusive` throw
([`rng.ts:51`](../../../engine/core/src/runtime/rng.ts#L51)) and `range()`'s bounds.

## Files you OWN
- [`engine/core/src/runtime/rng.test.ts`](../../../engine/core/src/runtime/rng.test.ts)

## Files you must NOT touch
- [`engine/core/src/runtime/rng.ts`](../../../engine/core/src/runtime/rng.ts) — **the implementation must
  not change**. This brief pins current behaviour; it does not improve it. If you find a genuine bug
  in the algorithm, stop and file it separately rather than fixing it in the same breath, because a
  fix here re-baselines four games.
- every game's sim code

## Acceptance
- Golden vectors committed, generated from the current implementation, and the test file explains
  their status.
- **Demonstrate the guard works**: temporarily perturb one constant in `rng.ts`, show the golden test
  goes red where the existing 10 stay green, then restore by hand (not via `git checkout`).
- `npm run test -w @engine/core` green, and no change to any game's output — this brief must be a
  no-op for every sim.
