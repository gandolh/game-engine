# audit-32 — Make the Hollow CLI export honest about the chronicle cap

status: closed 2026-09-15
created: 2026-09-14
ruled: 2026-09-15 (grill-me session) — "report vs raise the cap" is settled: **both**, plus exit 0.
context: follow-up from [audit-12](2026-09-13-audit-12-hollow-chronicle-bounded.md) (landed `c750e06`),
which the implementing agent flagged rather than working around.

## The gap

audit-12 made the chronicle a ring buffer capped at `CHRONICLE_CAP` (50,000) and made elision
**honest** everywhere it owned: `droppedCount()` on the chronicle, `getDroppedEventCount()` on the
client store, and a live note beside the export button stating the exact dropped count.

[`tools/hollow-sim/src/run-core.ts`](../../../tools/hollow-sim/src/run-core.ts) (~line 120) was outside
that ownership and still does:

```ts
const events = [...chronicle.events()];
```

So a headless CLI run long enough to exceed the cap exports **only the newest 50,000 events, with no
indication anything was dropped**. That is exactly the "never silently short" property chosen for
audit-12 — honoured in the UI, missed in the CLI.

Severity is lower than the worker bug audit-12 also found (that one froze event delivery outright):
this produces an incomplete final export, not a broken run. But Hollow is a **research instrument**,
and one that quietly truncates its own export invalidates an analysis months later, when nobody
remembers the run.

## The ruling

The spec left "report the drop **or** raise the cap" open. **Do both, in that order.**

1. **Always report the drop.** Surface `chronicle.droppedCount()` in the printed run summary **and**
   in the exported artifact. Unconditional — this is the correctness fix, and it is the part that
   satisfies the "never silently short" property.
2. **Give the CLI its own explicit larger cap.** A headless run has no DOM and a different memory
   budget than a browser session. Name a distinct constant; **do not** reuse or mutate
   `CHRONICLE_CAP`, which the client depends on.
3. **Do NOT make it unbounded.** Trading a truncated export for an OOM-killed run is the worse
   failure, and this project runs on constrained hardware
   (see [status.md](../../wiki/status.md) and the sim resource limits in [routing.md](../../routing.md)).
4. **Dropping events does not fail the run — warn, record, exit 0.** Refusing to hand over the data a
   run *did* collect helps nobody. The honesty bar is "impossible to analyse a truncated export
   unaware", which a summary line plus an export field meets.

Recorded in [decisions.md](../../wiki/decisions.md) → *Hollow chronicle & headless export*.

## Where the drop count goes in the export

Pick whichever placement keeps the existing `events.jsonl` **byte contract** intact — audit-12
deliberately preserved it, so a per-line format change is out. A header line in the JSONL or a field
in the JSON summary both qualify; say which you chose and why in the closeout.

## Files you OWN
- [`tools/hollow-sim/src/run-core.ts`](../../../tools/hollow-sim/src/run-core.ts) and its export/summary path
- the new CLI cap constant
- `tools/hollow-sim` tests

## Files you must NOT touch
- [`games/hollow/sim-core/src/observe/chronicle.ts`](../../../games/hollow/sim-core/src/observe/chronicle.ts)
  — the ring buffer and `droppedCount()` are correct as landed; **consume** them
- `CHRONICLE_CAP` itself — the client depends on its current value
- the per-event `events.jsonl` line format

## Acceptance
- A run exceeding the cap reports the **exact** dropped count in both the console summary and the
  export.
- A run below the cap reports 0 and is otherwise byte-identical to today's output.
- A test drives the chronicle past a **small injected cap** and asserts the export is honest.
  **No sim run** — the existing `tools/hollow-sim` tests show the hand-built-fixture pattern, and
  `@tool/*` tests are forbidden from booting a sim (CLAUDE.md, constrained hardware).
- Exit code is 0 on a run that dropped events.
- `npm run typecheck` + `npm run test -w @tool/hollow-sim` green.
