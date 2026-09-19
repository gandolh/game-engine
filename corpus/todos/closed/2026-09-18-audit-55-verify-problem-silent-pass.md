# audit-55 — `verifyProblem` silently asserts nothing for any topic it does not recognise

status: todo
created: 2026-09-18
context: found by the coverage lens of the 2026-09-18 sweep. Small, and it is the guard that
[audit-54](2026-09-18-audit-54-mathquest-grades-v-viii.md) depends on — do this one first.

## The gap

[`generators.test.ts:17`](../../../games/mathquest/sim-core/src/combat/generators.test.ts#L17) — the
helper the whole generator suite relies on to independently re-derive correctness is an if/else-if
chain with **no terminal `else`**:

```ts
function verifyProblem(p: Problem): void {
  const [x, y] = numbersIn(p.prompt);
  expect(x).toBeDefined();
  expect(y).toBeDefined();
  if (p.kind === "typed") {
    if (p.topic === "addition") { expect(p.answer).toBe(x! + y!); }
    else if (p.topic === "subtraction") { … }
    else if (p.topic === "multiplication") { … }
    // ← no else: an unknown typed topic falls through with zero assertions
  } else { /* comparison */ }
}
```

It is driven from a loop over `TOPICS_FOR_GRADE[grade]` ([`:59`](../../../games/mathquest/sim-core/src/combat/generators.test.ts#L59)),
so it **automatically picks up any topic added to that table** and reports a new green test named
`"… and the math checks out"` that checks no math at all.

## Failure scenario

Division, fractions, or any grade-V+ topic is added to `TOPICS_FOR_GRADE` and `GENERATORS`. The suite
immediately reports N new passing tests. A generator returning the wrong `answer` ships — and in this
game a wrong answer is a wrong combat resolution taught to a child as correct.

## What to do

Two lines of intent:

1. End the chain with a throw: `else throw new Error(\`verifyProblem: no independent check for topic
   "${p.topic}"\`)`.
2. Add a meta-test asserting `Object.keys(GENERATORS)` is exactly the set `verifyProblem` handles — so
   adding a generator **forces** adding its independent check, rather than relying on someone
   remembering.

(2) is the part that matters. (1) alone fails only when the new topic happens to be exercised;
(2) fails the moment the generator table and the checker disagree.

## Files you OWN
- [`games/mathquest/sim-core/src/combat/generators.test.ts`](../../../games/mathquest/sim-core/src/combat/generators.test.ts)

## Files you must NOT touch
- [`generators.ts`](../../../games/mathquest/sim-core/src/combat/generators.ts) — this brief must find no
  bug in the four existing generators. If it does, stop and file it: a wrong answer shipping today is
  a bigger deal than the guard.
- `TOPICS_FOR_GRADE` and the `Grade` type — widening the ladder is
  [audit-54](2026-09-18-audit-54-mathquest-grades-v-viii.md)

## Acceptance
- **Demonstrate first**: add a fake topic to `GENERATORS` + `TOPICS_FOR_GRADE`, show the suite green
  today, then red after the fix. Remove the fake topic by hand.
- The four existing topics still pass, with their checks genuinely independent of the generator (the
  test must re-derive the answer from the prompt, never read it back from the generator).
- `npm run test -w @mathquest/sim-core` green.
