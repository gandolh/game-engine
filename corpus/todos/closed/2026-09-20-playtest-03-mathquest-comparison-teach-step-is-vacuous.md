# playtest-03 — MateQuest's comparison teach card tells a first-grader to "compare the digits left to right" about 9 and 6

> **CLOSED 2026-09-20 — built.** `comparisonTeach` gained a single-digit branch that names the gap
> ("9 > 6: 9 este cu 3 mai mare decât 6") instead of quoting a place-value rule at a pair that has no
> place value to compare. The other three branches are unchanged. The duplicated "Ratat!" is gone —
> the teach card no longer repeats the turn line's cue. 5 new tests pin the branch **by operand
> shape** rather than by one example's wording, so the copy can still be improved.


status: CLOSED 2026-09-20 (see the note above; the original text below is unchanged) — a bug, found by playing the game in a browser
created: 2026-09-20
found: browser playtest (`npm run mathquest`, grade I fight, deliberate wrong answer)

## What happens

Answer a comparison problem wrong and the teach card appears. For **`Compară: 9 și 6`** it reads:

> **Învață:**
> Ratat!
> `9 > 6: compară cifrele de la stânga la dreapta`

"Compare the digits from left to right" is the **multi-digit place-value rule**. Applied to two
single-digit numbers it is vacuous: there is one digit on each side, and the sentence never says
which is bigger or why. The card's whole job — per the design, *a worked step* — is not done.

## Where it comes from

[`comparisonTeach`](../../../games/mathquest/sim-core/src/combat/generators.ts) has three branches:

```ts
if (relation === "=")                          return `${a} = ${b}: sunt egale`;                       // fine
if (String(big).length !== String(small).length) return `… ${big} are mai multe cifre decât ${small}`;   // good place-value reasoning
return `${a} ${relation} ${b}: compară cifrele de la stânga la dreapta`;                                 // the fallback
```

The fallback fires whenever both operands have the **same digit count** — and it is the *common* case
at the lowest rung, because grade 1 draws operands from `ADD_SUB_RANGE[1] = { min: 1, max: 10 }`
([constants.ts](../../../games/mathquest/sim-core/src/combat/constants.ts)):

| grade-1 comparison outcome | share of pairs | teach text |
|---|---|---|
| both single-digit, `a ≠ b` | **72%** | the vacuous fallback |
| one operand is 10, other 1–9 | 18% | "are mai multe cifre decât" ✓ |
| `a = b` | 10% | "sunt egale" ✓ |

So roughly **seven in ten** comparison teach cards at grade I say nothing useful, and the rung that
gets the worst explanation is the one with the youngest children.

For grades 2–4 the fallback is *correct* — comparing `47` and `52` really is a left-to-right digit
scan — so the fix must not replace it wholesale.

## Why this one matters more than its size suggests

The project has already written down the bar for this game:
[audit-54](2026-09-18-audit-54-mathquest-grades-v-viii.md) settled scope with the line *"in
this game a wrong answer is a wrong thing taught to a child"*, and
[audit-55](2026-09-18-audit-55-verify-problem-silent-pass.md) put an independent answer check
behind every topic. Both are about the **answer** being right. Nothing yet checks that the **teach
step is instructive**, and the teach card is the only moment in the loop where the game actually
teaches — the rest is assessment.

The other three helpers are genuinely good, which is worth saying: `additionTeach` does bridge-to-ten
(`7 + 8: 7 + 3 = 10, apoi + 5 = 15`), `subtractionTeach` does borrow-to-ten, and
`multiplicationTeach` does partial products. Comparison is the odd one out, not a systemic problem.

## What to do

Add a single-digit branch to `comparisonTeach` that reasons about *quantity*, which is how the
*programa* introduces comparison in clasa I (counting/ordering, not place value). Candidate wording
— settle the Romanian with care, it is player-facing copy for 6-year-olds:

- `9 > 6: 9 vine după 6 când numeri` ("9 comes after 6 when you count") — ordering on the number line
- or `9 > 6: 9 este cu 3 mai mult decât 6` ("9 is 3 more than 6") — the difference made explicit

The second is more informative and is trivially derivable (`big - small`). Both are better than the
digit-scan sentence. Keep the existing multi-digit branch for same-length pairs with 2+ digits, and
keep `=` as it is.

While in there: the card prints **"Ratat!" twice** — once in the turn line at the top of the command
box (`Tura 3  Ratat!`) and again as the teach card's first line. One of the two should go; the card's
line is the redundant one, since the turn line is always present.

## Acceptance

- A wrong answer on a single-digit comparison produces a teach line that names which number is
  larger and why, in Romanian and in English (`STRINGS_RO`/`STRINGS_EN` both covered — the helper is
  locale-branched).
- Multi-digit same-length pairs still get the left-to-right digit rule; different-length pairs still
  get "more digits"; `a = b` still gets "sunt egale".
- A test pins the branch selection by operand shape, not by string equality on one example: for each
  of (single-digit unequal, same-length multi-digit, different-length, equal) assert the teach text
  contains the expected reasoning marker. `generators.test.ts` is the home.
- "Ratat!" appears once on screen, verified in a browser.

## Out of scope

The division/fractions/units/geometry gap — that is the recorded I–IV scope decision
([mathquest-overview.md](../../wiki/mathquest-overview.md) → *Scope decision*), not a bug.
