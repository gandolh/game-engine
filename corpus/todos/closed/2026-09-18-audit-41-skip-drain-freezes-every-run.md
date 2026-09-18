# audit-41 — "Skip to highlight" drains up to 36 000 ticks synchronously and freezes every run on the box

status: todo
created: 2026-09-18
context: found by the ops lens of the 2026-09-18 sweep. This bites at **legitimate** settings — no
hostile client needed — because the Farm server hosts many runs in one process.

## The gap

[`games/farm/server/src/sim-host.ts:332-345`](../../../games/farm/server/src/sim-host.ts#L332-L345),
inside the `setInterval` callback:

```ts
const capTicks = SKIP_MAX_DAYS * this.ticksPerDay;   // SKIP_MAX_DAYS = 30
let skipped = 0;
while (!this.stopped && skipped < capTicks) {
  const { length: prevLen } = this.getEventFeedInfo();
  this.runOneTick();
  const { length: curLen, newestDrama } = this.getEventFeedInfo();
  skipped += 1;
  if (shouldStopSkip(prevLen, curLen, newestDrama, HIGHLIGHT_THRESHOLD)) break;
}
```

At the production `ticksPerDay = 1200` the cap is **36 000 ticks in one callback**. The loop never
yields, so for its whole duration the Node event loop is blocked: every *other* connected player's
sim stops ticking, no snapshots are sent, and sockets can time out. One player pressing Skip in a
quiet stretch stalls everyone.

`RunRegistry` puts one `SimHost` per run in a single process
([`run-registry.ts`](../../../games/farm/server/src/run-registry.ts)), which is what turns a local
stutter into a shared-server outage.

## The amplifier — `ticksPerDay` is never validated

`this.ticksPerDay = ticksPerDay` ([`sim-host.ts:172-173`](../../../games/farm/server/src/sim-host.ts#L172-L173))
takes the client's value with no bound, while `tickRateHz` right beside it **is** clamped
(`clampTickRateHz`). And the value is reachable from a share link:
[`run-descriptor.ts:31`](../../../games/farm/sim-core/src/run-descriptor.ts#L31) validates only
`ticksPerDay > 0`, so `#run=1-1-ffffffff` parses to `4294967295` and
[`main.ts:151`](../../../games/farm/client/src/main.ts#L151) feeds it straight into `client.init`.

Validation is [audit-42](2026-09-18-audit-42-farm-server-public-surface.md)'s job. **Fix the drain
here regardless** — 36 000 synchronous ticks is a defect at the legitimate value.

## What to do

Bound the drain by **wall clock**, not only by tick count, and resume on the next interval fire:
keep the skip target as state, run for a budget (~a few ms — well under one tick period), return,
and continue next fire until the highlight is found or the tick cap is hit.

Note the acceptable trade: skipping becomes slightly less instant. That is the correct trade — a
responsive server that skips over three fires beats a frozen one that skips in a single fire.

## Files you OWN
- [`games/farm/server/src/sim-host.ts`](../../../games/farm/server/src/sim-host.ts) — the skip loop and its state
- the `@farm/server` tests

## Files you must NOT touch
- `shouldStopSkip` / `HIGHLIGHT_THRESHOLD` — the *what counts as a highlight* rule is unchanged
- `runOneTick` and anything inside the tick — this is a pacing change only; a tick's output must stay
  a pure function of the tick count (determinism is load-bearing)
- `RunRegistry`'s fan-out — out of scope here

## Acceptance
- **Demonstrate first**: with two runs attached and `ticksPerDay = 1200`, trigger Skip on run A and
  show run B's tick count frozen for the duration.
- After the fix, run B keeps ticking while A skips, and A still reaches the same highlight after the
  same number of *logical* ticks.
- Skipping is **byte-identical** to before in sim outcome — same seed, same tick count, same result.
  Spreading the drain across fires must not change a single tick's output. Prove it with a small
  fast diff (`TICKS_PER_DAY=20`, low `MAX_DAYS`), not a full determinism run; ask before the latter.
