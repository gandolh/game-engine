# audit-17 — Farm's sim-host swallows a mid-tick fault and advances the tick anyway

status: todo
created: 2026-09-13
context: repo audit 2026-09-13 (`improve`). **Needs a decision before code** — halt vs. continue is a product call, not a refactor.

## The defect

[games/farm/server/src/sim-host.ts:289-294](../../games/farm/server/src/sim-host.ts#L289-L294):

```ts
        if (snapshot.gameOver) this.stop();
      } catch (err) {
        console.error(`[sim] tick ${tick} faulted; skipping snapshot`, err);
        pendingShock = null;
      }

      tick += 1;
```

The whole tick body — `scheduler.tick(...)` included — is inside the `try`. On a throw the handler logs,
nulls `pendingShock`, and then `tick += 1` runs **unconditionally**.

## Failure scenario

Systems run in a fixed, dependency-ordered sequence ([wiki/system-ordering.md](../wiki/system-ordering.md)).
If system N throws, systems 1..N-1 have already written their mutations for that tick and N..last never
ran — leaving a world state no clean tick could ever produce (e.g. inboxes written but never drained,
because `PerceiveSystem` clears them and `MarketSystem` drains them, both late in the order). The loop
then advances and feeds that state into the next tick, forever.

Two things make this worse than a normal swallowed error:
- **`CHECK_DETERMINISM` cannot see it.** It compares two runs of the *same* seed; both would fault
  identically and agree. The corruption is reproducible, which is exactly what the check tests for.
- **`this.stop()` is inside the `try`**, above the catch — so a throw before the `gameOver` check means
  a finished run also fails to stop.

The Farm server is the unattended one (one sim per WebSocket connection, pm2, 100 in-game days). The
observable symptom is a live run quietly drifting from a valid trajectory for every connected viewer,
with one console line as the only signal.

## The decision to make first

Pick one and record it in [wiki/decisions.md](../wiki/decisions.md):
- **(a) Halt the run** — mirror what `start()` already does on a startup fault
  ([sim-host.ts:155-158](../../games/farm/server/src/sim-host.ts#L155-L158)): stop the tick loop, tell
  the client the run is dead. Honest, and a dead run is diagnosable.
- **(b) Halt + report** — as (a), plus surface a terminal state to the client so a viewer sees "this run
  crashed" rather than a frozen screen.
- **(c) Keep going** — only defensible with an explicit argument for why a corrupted world is better than
  a stopped one for a spectator sim. If chosen, say so in the comment so the next reader knows it is
  deliberate.

Recommended: **(b)**.

## Files you OWN
- [games/farm/server/src/sim-host.ts](../../games/farm/server/src/sim-host.ts) + its test
- the client's handling of a terminal/faulted run, if (b)
- a line in [wiki/decisions.md](../wiki/decisions.md)

## Files you must NOT touch
- `@farm/sim-core` systems — do not "fix" the hypothetical throw; this spec is about the *policy* when
  one happens
- Citadel's `sim-host.ts` (its own gap is noted in the audit's Watch list, and its MP path is deprecated)

## Acceptance
- A test injects a throwing system and asserts the chosen policy holds: the loop does **not** advance
  onto corrupted state, and (for b) the client is told.
- `gameOver` still stops the run on the normal path — cover the case where the throw happens *after*
  `gameOver` would have been set.
- The decision and its rationale are written down.
- `npm run test -w @farm/server` green.
