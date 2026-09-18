# audit-43 — `@citadel/server` never got the hardening `@farm/server` has; add it to the revival preconditions

status: todo
created: 2026-09-18
context: found by the ops, coverage and debt lenses of the 2026-09-18 sweep (three independently).
Citadel MP is **deprecated by decision #21** — see
[`wiki/citadel-mp-deprecated.md`](../../wiki/citadel-mp-deprecated.md), which already lists three
known-broken things. This brief adds four more and fixes the one-liners.

**Read that page first.** Nothing here revives MP or relitigates #21. The point is that the page is
the record of *what must be true before MP could ever be exposed*, and it is currently incomplete.

## The four gaps, each a divergence from the Farm server that got it right

**1. `speed` has no upper bound.** [`sim-host.ts:199-202`](../../../games/citadel/server/src/sim-host.ts#L199-L202):

```ts
this.speed = Number.isFinite(msg.multiplier) && msg.multiplier >= 1 ? Math.floor(msg.multiplier) : 1;
```

and [`:273-276`](../../../games/citadel/server/src/sim-host.ts#L273-L276) uses it as a synchronous loop
count inside `setInterval`. Farm clamps — `Math.min(MAX_SPEED_MULTIPLIER, …)`
([`farm/server/src/sim-host.ts:108-113`](../../../games/farm/server/src/sim-host.ts#L108-L113)). Citadel
is the copy that dropped it. The host check is no defence: `attach` makes the **first** peer to
connect the host.

**2. No process-level error handlers, and no guard around the tick.**
[`index.ts:44-48`](../../../games/citadel/server/src/index.ts#L44-L48) registers only `SIGINT`/`SIGTERM`;
`step()` ([`:281-289`](../../../games/citadel/server/src/sim-host.ts#L281-L289)) calls
`scheduler.tick` with no try/catch. One throw from any system inside the interval callback takes the
whole process down. Farm has both halves.

**3. No `maxPayload`.** [`index.ts:23`](../../../games/citadel/server/src/index.ts#L23) constructs the
`WebSocketServer` without one, so `ws`'s 100 MB default applies; Farm sets 64 KB. Combined with
`placeRoad`/`placeWall` looping a caller-supplied `cmd.payload.tiles` with no length check
([`sim-bootstrap.ts:378-384`](../../../games/citadel/sim-core/src/sim-bootstrap.ts#L378-L384)), a single
frame controls how much work the tick does.

**4. `PlayerState` is never removed on detach.** `nextPlayerId` only increments
([`:111`](../../../games/citadel/server/src/sim-host.ts#L111)), `ensurePlayer` only pushes
([`:247-252`](../../../games/citadel/server/src/sim-host.ts#L247-L252)), and `detach`
([`:126-139`](../../../games/citadel/server/src/sim-host.ts#L126-L139)) removes the peer from the Set but
leaves its `PlayerState` in `sim.state.players` forever. `reset()` only fires when the room fully
empties. ~89 sim-core call sites iterate that array.

## Explicitly NOT in scope

- **Do not cap `state.commandLog`.** It looks unbounded, and it is — because it *is the save*. The
  locked save model is "seed + event-sourced input log, not snapshots"
  ([`wiki/decisions.md`](../../wiki/decisions.md) → Sim), and
  [`sim-bootstrap.ts:235`](../../../games/citadel/sim-core/src/sim-bootstrap.ts#L235) replays it on load.
  Truncating it breaks load. Noted here so the next reader does not re-find it as debt.
- Rooms-per-process, the late-joiner seed, and `request-save` — those are the three already on the
  deprecation page. Leave them there.

## What to do

Fix 1–3 (each is small) and 4 (a little more care: decide id reuse vs filtering, and check nothing
depends on `players` indices being stable). Then **update
[`wiki/citadel-mp-deprecated.md`](../../wiki/citadel-mp-deprecated.md)**: anything not fixed becomes a
numbered revival precondition alongside the existing three, with the same "what is broken / what the
fix is" shape. A deprecated-but-present server whose hazards are written down is fine; one whose
hazards are only in a closed audit is not.

## Files you OWN
- [`games/citadel/server/src/sim-host.ts`](../../../games/citadel/server/src/sim-host.ts)
- [`games/citadel/server/src/index.ts`](../../../games/citadel/server/src/index.ts)
- the `placeRoad`/`placeWall` payload length guards in [`games/citadel/sim-core/src/sim-bootstrap.ts`](../../../games/citadel/sim-core/src/sim-bootstrap.ts)
- `@citadel/server` tests + [`wiki/citadel-mp-deprecated.md`](../../wiki/citadel-mp-deprecated.md)

## Files you must NOT touch
- anything that would **revive** MP — decision #21 stands; this is hardening a deprecated path, not
  reopening it
- `state.commandLog` (above)
- the per-room reap/grace machinery — `citadel-mp-deprecated.md` records it as *already correct and
  verified live* (brief 108). Lift it, don't rewrite it.
- the solo Web-Worker path (`games/citadel/client/src/worker/`) — solo is the shipped game and is not
  what this brief touches

## Acceptance
- A `malformed` test per the Farm one in [audit-42](2026-09-18-audit-42-farm-server-public-surface.md):
  `{}`, `{type:"command"}` (note `msg.command.type` is dereferenced unguarded at
  [`sim-host.ts:177`](../../../games/citadel/server/src/sim-host.ts#L177)), `{type:"speed",multiplier:1e9}`
  — asserting no throw and no state change.
- A test that a peer detaching removes its `PlayerState`, and that reconnect-looping does not grow
  `state.players` without bound.
- `speed` is clamped to the same ceiling Farm uses.
- `npm run test -w @citadel/server` + `-w @citadel/sim-core` green; solo Citadel still boots.
- `citadel-mp-deprecated.md` lists every remaining hazard as a numbered precondition.
