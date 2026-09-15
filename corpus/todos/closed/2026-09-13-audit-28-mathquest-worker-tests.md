# audit-28 — MateQuest's Worker command channel has no tests, unlike its siblings'

status: todo
created: 2026-09-13
context: repo audit 2026-09-13 (`improve`). Coordinate with [audit-03](2026-09-13-audit-03-mathquest-drop-snapshot-pump.md) — that spec changes this file; do this one after, or together.

## The gap

[games/mathquest/client/src/worker/sim-worker.ts:145-181](../../../games/mathquest/client/src/worker/sim-worker.ts#L145-L181)
is the entire postMessage boundary between the UI and `bootstrapMathquestSim()` — 8 command types — and it
has **no colocated test**. Its siblings do:
[citadel/client/src/worker/sim-worker.test.ts](../../../games/citadel/client/src/worker/sim-worker.test.ts) and
[hollow/client/src/worker/inspect.test.ts](../../../games/hollow/client/src/worker/inspect.test.ts).

Every handler dispatches through optional chaining — `sim?.chooseNode(msg.id)` (148),
`sim?.chooseAction` (153), `sim?.submitAnswer` (158), and five more.

MateQuest's client is also the thinnest-tested in the repo overall: 3,359 src lines against 1,074 test lines
across 6 files (measured 2026-09-13).

## Failure scenario

A command arriving before `"init"` — or after any future teardown/reset path — is **silently swallowed**:
the `?.` no-ops and `postSnapshot()` also early-returns on `sim === null`, so the UI shows nothing and logs
nothing. A child staring at an unresponsive problem screen is the user-visible form of this.

Worse, because nothing pins the behaviour: a plausible future cleanup that removes the `?.` while adding a
9th command turns that same race into an uncaught `TypeError` inside the Worker's `onmessage`, killing the
run outright. No test would catch either the current silent drop or the regression to a hard crash.

## Fix sketch

Mirror Citadel's test pattern (stub `self.postMessage`, dispatch synthetic `WorkerInbound` messages, fake
timers):

1. A command sent **before** `"init"` does not throw and produces no `"snapshot"` message — pinning the
   current deliberate behaviour so a future refactor cannot silently change it.
2. Each real command produces the expected effect in the posted snapshot: `chooseNode`, `chooseAction`,
   `submitAnswer` (correct and incorrect), `acknowledgeTeach`, `chooseLevelUp`, `chooseLoot`, `newRun`.
3. An unknown/malformed command type is handled predictably rather than crashing the Worker.

Also decide explicitly whether silent-drop is the *right* behaviour. A one-line `console.warn` on a
pre-init command would have made this diagnosable; if you add one, keep it out of the hot path.

## Files you OWN
- new `games/mathquest/client/src/worker/sim-worker.test.ts`
- [games/mathquest/client/src/worker/sim-worker.ts](../../../games/mathquest/client/src/worker/sim-worker.ts)
  only for a diagnostic warning, if you add one

## Files you must NOT touch
- `@mathquest/sim-core` — its `sim-bootstrap.test.ts` (1,440 lines) already covers sim behaviour well; this
  spec is about the *boundary*
- the other games' workers

## Acceptance
- All 8 command types are exercised through the postMessage boundary, asserting real outcomes in the posted
  snapshot — not `toBeDefined()` or `not.toThrow()` standing in for a check. Weak assertions are the specific
  failure pattern this repo has shipped inert features behind twice; do not add more.
- The pre-init case is pinned by test.
- Tests use fake timers and start no real interval; they run in milliseconds.
- `npm run test -w @mathquest/client` green.
