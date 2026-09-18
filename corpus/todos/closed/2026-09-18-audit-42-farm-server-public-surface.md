# audit-42 — The public Farm sim server validates almost nothing it is sent, and caps nothing it creates

status: todo
created: 2026-09-18
context: found by the ops lens of the 2026-09-18 sweep, corroborated by the coverage lens (neither WS
server has a malformed-input test). `@farm/server` is the one sim host that is actually deployed and
publicly reachable.

## The gaps — three, one seam

**1. `init` is unvalidated.** [`sim-host.ts:172-173`](../../../games/farm/server/src/sim-host.ts#L172-L173)
destructures `seed`, `ticksPerDay`, `maxDays`, `tickRateHz` and assigns them. Only `tickRateHz` is
clamped (`clampTickRateHz`). `ticksPerDay` and `maxDays` go straight into `bootstrapSim` and into
`SKIP_MAX_DAYS * this.ticksPerDay` (see [audit-41](2026-09-18-audit-41-skip-drain-freezes-every-run.md)).
A share link is enough to set them: [`run-descriptor.ts:31`](../../../games/farm/sim-core/src/run-descriptor.ts#L31)
only checks `> 0`.

**2. No cap on concurrent runs.** [`run-registry.ts:53-77`](../../../games/farm/server/src/run-registry.ts#L53-L77)
mints a fresh world plus its own tick interval for every distinct `clientId`, and `detach` only arms a
10 s reap grace ([`:152`](../../../games/farm/server/src/run-registry.ts#L152)). `runCount()` exists but
nothing reads it as a limit. One socket looping `init` with a new `clientId` creates full 21-farmer
worlds faster than they are reaped. No malice required either: N browser tabs = N live sims, since the
normal client path is `clientId: crypto.randomUUID()` ([`main.ts:340`](../../../games/farm/client/src/main.ts#L340)).

**3. One inconsistent field.** `applyInput` assigns `e.player!.selectedSlot = selectSlot` with no
range check ([`sim-host.ts:190-199`](../../../games/farm/server/src/sim-host.ts#L190-L199)) while its
sibling `applySwapSlots` validates via `isValidSwapIndex` ([`:205`](../../../games/farm/server/src/sim-host.ts#L205)).
Under `noUncheckedIndexedAccess` a downstream `itemSlots[selectedSlot]` is `undefined`; a deref throws
inside the tick, and audit-17's fault policy halts that run.

## What to do

Validate **at the wire boundary**, once, before anything reaches `bootstrapSim` or the ECS — a single
narrowing guard over `SimInbound` rather than scattered checks per handler. Clamp-or-reject is a
judgment call per field; state which you chose and why:

- `ticksPerDay`, `maxDays`, `seed` — bounded ranges, rejected with a structured error rather than
  silently coerced (a silently-coerced share link renders a different world than it names)
- `selectSlot`, `a`, `b`, `moveX`, `moveY` — finite, in range, right type
- unknown `type` — dropped, not thrown

Then cap `RunRegistry`: a ceiling on total live runs, and **one run per socket** (a socket that
re-`init`s should reap its previous run immediately rather than arming the grace timer — the grace
exists for reconnects, not for the same live socket).

`maxPayload: 64 * 1024` is already set ([`index.ts:47-51`](../../../games/farm/server/src/index.ts#L47-L51))
— that part is fine, and is the model for Citadel in
[audit-43](2026-09-18-audit-43-citadel-server-hardening.md).

## Files you OWN
- [`games/farm/server/src/sim-host.ts`](../../../games/farm/server/src/sim-host.ts) — `handleInbound`, `applyInput`
- [`games/farm/server/src/run-registry.ts`](../../../games/farm/server/src/run-registry.ts)
- [`games/farm/server/src/index.ts`](../../../games/farm/server/src/index.ts)
- a new `sim-host.malformed.test.ts` in `@farm/server`
- [`games/farm/sim-core/src/run-descriptor.ts`](../../../games/farm/sim-core/src/run-descriptor.ts) — parse-side bounds

## Files you must NOT touch
- `bootstrapSim` and every system — validation belongs at the boundary, not smeared into the sim
- the `process.on("uncaughtException"/"unhandledRejection")` handlers and audit-17's tick fault
  policy — both correct; this brief stops faults happening, it does not change what happens after one
- the reap-grace *reconnect* semantics (a genuinely detached socket keeps its 10 s window)

## Acceptance
- A table-driven `malformed` test drives `handleInbound` with junk — `{}`, unknown `type`,
  `{type:"input",moveX:"3"}`, `{type:"input",selectSlot:-1}`, `{type:"init",ticksPerDay:4294967295}`,
  `{type:"speed",multiplier:"fast"}` — asserting **no throw** and that sim state is unchanged.
- A test that the Nth+1 run past the cap is refused with a structured error and no world allocated.
- A test that a socket re-`init`ing does not leave its previous run ticking.
- A rejected `init` must not leave a half-built run in the registry.
- Well-formed traffic is bit-for-bit unaffected: same seed → same run. Fast diff only; ask before any
  full determinism check.
