# audit-12 — Hollow's chronicle grows unbounded in two heaps at once

status: todo
created: 2026-09-13
context: repo audit 2026-09-13 (`improve`). A session-length memory problem on the one game explicitly built for long runs.

## The defect

[games/hollow/sim-core/src/observe/chronicle.ts:79-81](../../games/hollow/sim-core/src/observe/chronicle.ts#L79-L81)
— `buffer` is append-only, no cap, no eviction:
```ts
const capture = (ontology: string) => (msg) => {
  buffer.push({ tick: bodyTick(msg.body), ontology, ...msg.body });
};
… events: () => buffer,
```

And the main thread keeps a **second full copy**:
[games/hollow/client/src/research-store.ts:36](../../games/hollow/client/src/research-store.ts#L36)
`ingestEvents` pushes every delta into its own `events` array.

Only the **DOM** is capped (`chronicle-panel.ts:143`, `MAX_ROWS = 300`) — which is why this is invisible
in normal use.

## Failure scenario

The panel's own comment records the rate: cooperation events alone fire hundreds per sim-year, and at
`TICKS_PER_DAY = 200` a sim-year is ~10 s of wall clock at speed 1 (~1.25 s at speed 8). At ~500
events/sim-year that is ~3,000 flat event objects per wall-clock minute, retained **twice**. An
hour-long research run holds ~360k objects across the two heaps (tens of MB plus fragmentation) and
neither buffer is ever trimmed. `export-panel.ts:76` is the only consumer that genuinely needs full history.

## Fix sketch

- Give the chronicle a **ring buffer** with a dropped-count tally, so exports can state honestly what
  was elided rather than silently truncating.
- On the client, keep full history only while the export panel needs it; otherwise cap `events` to the
  same order as the DOM cap.
- Alternative worth considering: stream events out of the worker and keep only unacknowledged deltas.

Decide and record whether a research export is allowed to be lossy. If it is not, the cap belongs on the
*client* copy only and the worker buffer needs a documented memory ceiling instead.

## Files you OWN
- [games/hollow/sim-core/src/observe/chronicle.ts](../../games/hollow/sim-core/src/observe/chronicle.ts)
- [games/hollow/client/src/research-store.ts](../../games/hollow/client/src/research-store.ts)
- the export panel, if the export contract changes

## Files you must NOT touch
- the event *shapes* — the chronicle is a research instrument; do not change what is recorded
- any system that emits events

## Acceptance
- Worker and client memory both plateau across a long fast-forwarded run. Report retained-object counts
  or heap size at 1, 5 and 15 minutes.
- Exports either remain complete, or state explicitly how many events were dropped — never silently short.
- `npm run test -w @hollow/sim-core` + `-w @hollow/client` green; `npm run sim:hollow` chronicle export
  for a fixed seed is unchanged for a run shorter than the cap.
