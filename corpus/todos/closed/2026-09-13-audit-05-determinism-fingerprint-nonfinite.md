# audit-05 — The determinism checker is blind to the drift it exists to catch

status: todo
created: 2026-09-13
context: repo audit 2026-09-13 (`improve`). No sim run needed to fix or verify this — pure unit work.

## The defect

`CHECK_DETERMINISM=1` compares two runs of the same seed via
[tools/run-sim/src/run-core.ts:87-89](../../../tools/run-sim/src/run-core.ts#L87-L89):

```ts
export function fingerprint(result: RunResult): string {
  return JSON.stringify(result);
}
```

`JSON.stringify` coerces `Infinity`, `-Infinity` and `NaN` all to `null`, and renders `-0` as `0`.
Demonstrated 2026-09-13:

```
Infinity vs -Infinity : equal
NaN      vs  Infinity : equal
-0       vs  0        : equal
```

[tools/hollow-sim/src/determinism.ts:24-26](../../../tools/hollow-sim/src/determinism.ts#L24-L26) has the
same shape, and neither function has a test: `tools/run-sim` has **0 test files**, and
`tools/hollow-sim/src/run-core.test.ts` re-implements its own `JSON.stringify` comparison rather than
calling `fingerprint`.

## Failure scenario

`FarmerSummary`/metrics fields are floats derived from division (gold and valuation formulas). A real
nondeterminism bug that flips a value between `Infinity` and `-Infinity`, or between `0` and `-0`,
between the two passes — precisely the floating-point-drift class this tool exists to surface —
fingerprints **identically** and prints `DETERMINISM CHECK PASSED`.

This is load-bearing: [decisions.md](../../wiki/decisions.md) makes determinism a hard invariant, and
`corpus/routing.md` routes determinism questions to "run the guard test — the tests are the authority."
That authority currently cannot see a whole class of divergence.

## Fix sketch

Replace the bare stringify with a replacer that maps non-finite numbers and `-0` to distinct sentinel
strings before serializing, e.g. `Infinity` → `"__Inf"`, `-Infinity` → `"__-Inf"`, `NaN` → `"__NaN"`,
and `Object.is(v, -0)` → `"__-0"`. Apply the same change in both tools. Keep the output a string so
every existing caller is unaffected.

Also make `describeDivergence` report these cases legibly rather than showing two `null`s.

## Files you OWN
- [tools/run-sim/src/run-core.ts](../../../tools/run-sim/src/run-core.ts)
- [tools/hollow-sim/src/determinism.ts](../../../tools/hollow-sim/src/determinism.ts)
- new: `tools/run-sim/src/run-core.test.ts` (and extend `tools/hollow-sim/src/run-core.test.ts`)
- `tools/run-sim/package.json` — add a `test` script if absent (see audit-20; if that spec lands
  first, this one just adds the test file)

## Files you must NOT touch
- any `sim-core` or engine source — this changes only how results are *compared*, never what is computed
- the `RunResult` shape

## Acceptance
- A unit test builds two `RunResult` objects differing **only** by `Infinity` vs `-Infinity` in one leaf
  field and asserts `fingerprint` reports them as **different**. Same for `NaN` vs `Infinity` and `-0`
  vs `0`.
- A test asserts two genuinely identical results still fingerprint equal (no false alarms).
- `describeDivergence` output for a non-finite mismatch names the field and both values.
- Tests run in milliseconds — **no sim run**, no `MAX_DAYS`, nothing that loads the box.
- Both tools' suites green.
