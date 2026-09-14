# audit-32 — The Hollow CLI export silently drops events past the chronicle cap

status: todo
created: 2026-09-14
context: follow-up from [audit-12](2026-09-13-audit-12-hollow-chronicle-bounded.md) (landed `c750e06`), which the implementing agent flagged rather than working around.

## The gap

audit-12 made the chronicle a ring buffer capped at `CHRONICLE_CAP` (50,000) and made elision
**honest** everywhere it owned: `droppedCount()` on the chronicle, `getDroppedEventCount()` on the
client store, and a live note beside the export button stating the exact dropped count.

`tools/hollow-sim/src/run-core.ts` (~line 120) was outside that ownership and still does:

```ts
const events = [...chronicle.events()];
```

So a headless CLI run long enough to exceed the cap exports **only the newest 50,000 events, with no
indication anything was dropped**. That is exactly the "never silently short" property the user chose
when deciding how audit-12 should behave — honoured in the UI, missed in the CLI.

Severity is lower than the worker bug audit-12 also found (that one froze event delivery outright and
was fixed in the same commit): this produces an incomplete final export, not a broken run. But a
research instrument that quietly truncates its own export is the kind of thing that invalidates an
analysis months later.

## What to do

Make the CLI export report elision the same way the UI does:
- surface `chronicle.droppedCount()` in the run result / summary
- state it in the printed run summary and in the exported artifact (a header line in the JSONL, or a
  field in the JSON summary — pick whichever keeps the existing `events.jsonl` byte contract intact,
  since audit-12 deliberately preserved it)
- if a run drops events, say so loudly enough that nobody analyses a truncated export unaware

Consider whether the CLI should simply raise its own cap (a headless run has no DOM and different
memory constraints than a browser session) — that is a legitimate alternative, but it must be a
*decision*, not an accident, and the drop report should exist either way.

## Files you OWN
- [tools/hollow-sim/src/run-core.ts](../../tools/hollow-sim/src/run-core.ts) and its export/summary path
- `tools/hollow-sim` tests

## Files you must NOT touch
- [games/hollow/sim-core/src/observe/chronicle.ts](../../games/hollow/sim-core/src/observe/chronicle.ts) —
  the ring buffer and `droppedCount()` are correct as landed; consume them
- the `events.jsonl` byte format, unless you deliberately decide to change it and say so

## Acceptance
- A run exceeding the cap reports the exact dropped count in both the console summary and the export.
- A run below the cap reports 0 and is unchanged from today.
- A test drives the chronicle past a small injected cap and asserts the export is honest — no sim run
  needed (the existing `tools/hollow-sim` tests show the hand-built-fixture pattern).
