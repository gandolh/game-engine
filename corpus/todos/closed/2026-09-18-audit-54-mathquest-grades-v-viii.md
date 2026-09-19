# audit-54 — MateQuest ships grades I–IV while the whole repo advertises I–VIII

status: todo — needs a CONTENT-DESIGN decision before any code
created: 2026-09-18
context: found by the undone-work lens of the 2026-09-18 sweep. Deferred twice inside MateQuest's
BUILD-STATE and never queued anywhere, while the milestone plan is marked COMPLETE.

## The gap

[`combat/types.ts:28`](../../../games/mathquest/sim-core/src/combat/types.ts#L28):

```ts
export type Grade = 1 | 2 | 3 | 4;
```

[`generators.ts:209-214`](../../../games/mathquest/sim-core/src/combat/generators.ts#L209-L214) has
exactly four keys and four topics (addition, subtraction, multiplication, comparison);
`BOSS_NODE_GRADE` and `BOSS_GRADE` are both `4`.

Meanwhile [`CLAUDE.md:12`](../../../CLAUDE.md) tells every future agent MateQuest is *"a
Romanian-curriculum (grades I–VIII) math roguelike"*, and
[`wiki/mathquest-overview.md`](../../wiki/mathquest-overview.md) sells the design as *"an 8-rung ladder
the curriculum already provides"*.

The BUILD-STATE records the deferral honestly — M2: *"**Deferred (not built):** word-problems,
fractions, geometry, grades V–VIII"*, and under "Still outstanding (post-plan, OPTIONAL future work)":
*"Grades V–VIII problem generators (an 'M2.5'; the ladder + `TOPICS_FOR_GRADE` are ready to extend)"*.
But the plan is marked complete, so this lives only in a bullet list nobody routes to.

## Why it matters

Grades V–VIII is *gimnaziu* — the ages `mathquest-overview.md` itself names as the deductive-reasoning
tier, and the half of the audience the 8-rung design was built for. And because `CLAUDE.md` says I–VIII,
nobody is looking for the gap; an agent asked to touch MateQuest content will assume it exists.

## The decision to make — this is content design, not a coding task

Grades V–VIII are not "more of the same with bigger numbers". The curriculum shifts to fractions,
ratios, negative numbers, powers, equations, and geometry — and *"solving a problem IS the combat
action"* constrains what is usable: a problem must be answerable in a few seconds, under turn pressure,
on a canvas keypad.

Settle before writing code:

1. **Which topics per rung**, against the actual Romanian curriculum, and which are viable as a combat
   action at all. A multi-step equation may simply not fit the loop — that is a finding, not a failure.
2. **What answer shapes the combat UI must gain.** Today it is typed numbers and comparison. Fractions
   and negatives need input affordances that do not exist yet; that may be the larger half of the work.
3. **How the run/map ladder stretches to 8 rungs** — `BOSS_NODE_GRADE`/`BOSS_GRADE` are `4`, and run
   length and pacing were tuned for four.
4. **Or: narrow the claim.** Decide MateQuest is a grades I–IV game and correct `CLAUDE.md`, the wiki
   and the overview. Entirely defensible, and much cheaper than pretending the gap will close.

Do not open this as "add four grades". Pick the scope first.

## Files likely involved
- [`games/mathquest/sim-core/src/combat/types.ts`](../../../games/mathquest/sim-core/src/combat/types.ts), [`generators.ts`](../../../games/mathquest/sim-core/src/combat/generators.ts)
- the map/run ladder and mastery tracking in `@mathquest/sim-core`
- [`games/mathquest/client/src/ui/combat-screen.ts`](../../../games/mathquest/client/src/ui/combat-screen.ts) — answer input
- [`CLAUDE.md`](../../../CLAUDE.md), [`wiki/mathquest-overview.md`](../../wiki/mathquest-overview.md) — whichever way the decision goes

## Acceptance
- A decision recorded in [`wiki/mathquest-overview.md`](../../wiki/mathquest-overview.md) with the topic
  table per rung (or the narrowed scope), **before** any generator is written.
- `CLAUDE.md` and the overview agree with the code, whichever direction that is settled in.
- If building: every new topic gets an **independent** answer check in the test helper — see
  [audit-55](../closed/2026-09-18-audit-55-verify-problem-silent-pass.md), which must land first or this brief
  will ship green tests that assert nothing. In this game a wrong answer is a wrong thing taught to a
  child; that is the bar.
- Romanian first, English second, for every new string.
