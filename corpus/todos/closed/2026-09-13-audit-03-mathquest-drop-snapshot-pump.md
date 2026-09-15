# audit-03 — MateQuest pumps a full snapshot 20×/sec for a turn-based game

status: todo
created: 2026-09-13
context: repo audit 2026-09-13 (`improve`). Cheapest real perf win in the batch — the fix is deleting code.

## The defect

[games/mathquest/client/src/worker/sim-worker.ts:128-135](../../../games/mathquest/client/src/worker/sim-worker.ts#L128-L135):

```ts
function startLoop(): void {
  if (intervalId !== null) clearInterval(intervalId);
  intervalId = setInterval(() => {
    if (sim === null) return;
    sim.step();
    postSnapshot();        // full GameSnapshot, structured-cloned
  }, BASE_MS_PER_TICK);    // 1000 / 20 = 50 ms
}
```

MateQuest is turn-based: solving a problem *is* the combat action. Nothing changes between commands,
and the sim says so itself at
[mathquest/sim-core/src/sim-bootstrap.ts:19-22](../../../games/mathquest/sim-core/src/sim-bootstrap.ts#L19-L22):

> "Run/combat state changes **ONLY** inside the commands below, never inside `step()`, so a run's
> outcome depends solely on the (seed, command sequence) pair, never on wall-clock timing."

Every command handler already calls `postSnapshot()` itself. So all 20 builds + structured clones per
second are provably redundant.

## Failure scenario

Any MateQuest session, permanently. Each 50 ms the worker rebuilds `RunView` (an
`inventory.map(toItemView)` plus object spreads), posts it, and the main thread pays a structured-clone
deserialize plus a `JSON.stringify(snapshot.run.mastery)` at
[client/src/main.ts:179](../../../games/mathquest/client/src/main.ts#L179). The screen is static between
keypresses, so 100% of it is waste — and the main-thread message queue is never idle, which matters on
the low-end school hardware this game targets.

## Fix sketch

Delete the interval. Post on `init` and after each command (already done by every handler). If a
heartbeat is ever wanted for animation, gate it behind a dirty flag the sim sets — do not reinstate an
unconditional pump.

Check whether anything depends on the pump as an implicit "keep-alive" before deleting: grep the client
for assumptions that a snapshot arrives without a command (e.g. a timer/animation driven off snapshot
arrival). If something does, convert that consumer to its own rAF rather than keeping the worker pump.

## Files you OWN
- [games/mathquest/client/src/worker/sim-worker.ts](../../../games/mathquest/client/src/worker/sim-worker.ts)
- any client code that depended on the unconditional snapshot cadence

## Files you must NOT touch
- [games/mathquest/sim-core/**](../../../games/mathquest/sim-core/) — `step()` stays exactly as is; this
  is a client/transport change and the sim's determinism contract is unaffected
- the other games' workers (they run continuous sims and legitimately need a pump)

## Acceptance
- No `setInterval` drives snapshots in the MateQuest worker.
- Verified **in a real browser** (`npm run mathquest`): start a run, choose a node, solve a problem,
  take damage, level up, pick loot, use a lifeline, finish a run — the UI updates correctly at every
  step. A turn-based game must show *zero* behavioural difference.
- Report the measured drop in snapshot posts per second (expect 20/s → ~0/s idle).
- `npm run test -w @mathquest/client` and `-w @mathquest/sim-core` green.
