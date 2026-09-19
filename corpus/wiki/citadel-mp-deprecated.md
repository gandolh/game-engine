---
summary: Citadel multiplayer is deprecated (decision #21) — what still exists in the tree, the five known-broken things nobody fixed, what audit-43 did fix, and the exact preconditions for reviving it. Read this before touching @citadel/server.
updated: 2026-09-18
---

# Citadel Multiplayer — Deprecated

**Status: deprecated 2026-07-10, not deleted** ([decision #21](citadel-decisions.md)).

`@citadel/server`, the client's `?mp` path, and `CitadelSimHost` all remain in the tree. They compile,
their tests pass, and nothing runs them. They are **unmaintained and known-broken** in the specific
ways recorded below.

**Updated 2026-09-18 (audit-43).** The 2026-09-18 sweep found four more divergences from the Farm
server — each a place Citadel copied Farm and dropped a guard. All four were **fixed** (they were
one-liners plus one careful case), and the list is kept here as the record of what was wrong. Two
things audit-43 did NOT fix are added to the revival preconditions below as **#4 and #5**.

## Why it was deprecated

Multiplayer accumulated a design that removed every reason to play it. Decision **#7** removed the
score; **#9** removed the ending; **#15** removed the armies; **#17** made the run ephemeral — it dies
with its last peer, and `request-save` hands you a blob nothing in MP can load. What remained was a
scoreless, endless, unsaveable co-op sandbox, and the remaining work to make it *safe to expose* was
four briefs of infrastructure ([109](../todos/closed/109-citadel-vps-deploy.md),
[110](../todos/closed/110-citadel-client-world-size.md),
[111](../todos/closed/111-citadel-mp-room-keys-and-session-semantics.md),
[112](../todos/closed/112-citadel-cozy-mp-drop-armies.md)) serving no identified player.

Asked directly *who is this for*, the answer was: nobody yet. So it waits.

This was the right shape of question to ask, and it was not asked when
[brief 108](../todos/closed/108-citadel-live-mp-verification.md) first drove MP live hours
earlier — that pass, and the decisions it produced (#11–#20), all answered *how do we make MP correct*
rather than *should we*.

## What is broken (and stayed broken)

These are **real defects in code that still ships**. Each is unreachable only because nothing
hosts Citadel publicly. They are the revival preconditions.

### 1. One room per process — a stranger joins *your* game
[`games/citadel/server/src/index.ts`](../../games/citadel/server/src/index.ts) constructs a single
`CitadelSimHost`, and **every** WebSocket peer attaches to it. Its own header admits it: *"One
authoritative multi-writer room per server process (a multi-room lobby is a follow-up)."*

On a public box, any connecting stranger can place and demolish inside your settlement.

**Fix (was decision #16):** rooms keyed by id, joined via `?mp=<roomId>`, porting the Farm
`RunRegistry` pattern that citadel-38 item 7 already names as the model this server diverges from. The
per-room reap/grace machinery in `CitadelSimHost` is **already correct and verified live** (brief 108:
rejoin at 3.1 s keeps the run, at 12 s gets a fresh one) — lift it, don't rewrite it. ⚠️ `reset()`
currently nulls process-global `hostPeer`, `nextPlayerId` and `bots`; those must become per-room.
The room id is a **capability, not a secret** — invite-by-link, not authentication.

Spec: [brief 111](../todos/closed/111-citadel-mp-room-keys-and-session-semantics.md).

### 2. Late joiners can render a different world
`init` carries the **client's** hardcoded `SEED`, and only the **first** peer's seed starts the sim.
A late joiner regenerating terrain from its own constant silently renders a different world.

**Fix (was decision #14):** the server sends the `TerrainGrid` once, with `width`/`height`, on `ready`
or riding the first snapshot; the client **never** generates its own world in MP. This makes terrain
desync structurally unrepresentable. (Solo keeps generating locally — solo *is* the sim.)

### 3. `request-save` hands out a blob MP cannot load
`request-save` returns a save ([sim-host.ts:205-206](../../games/citadel/server/src/sim-host.ts)) while
`load-save` is a deliberate no-op in a shared room (*"would desync live peers"*). The API promises a
recoverability it does not have.

**Fix (was decision #17):** remove or gate `request-save` in MP. An MP run is session-shaped **by
design**; that is the intent, not an omission. Say so in the code, not by a silent `return`.

### 4. No wire-level input validation — Farm's `validate-inbound.ts` is not ported
Farm gained a single narrowing guard over every inbound frame ([audit-42](../todos/closed/2026-09-18-audit-42-farm-server-public-surface.md)):
bounded `seed`/`ticksPerDay`/`maxDays`, range-checked indices, unknown types dropped, refusals
returned as a structured `rejected` frame. Citadel has **only a shape guard** — `typeof msg ===
"object"` and a string `type` — added by audit-43 so a `null` frame cannot throw out of the interval
callback.

So every `command` payload past `type` is still taken on trust. `placeRoad`/`placeWall` tile lists
are length-capped (`MAX_DRAG_TILES`, audit-43) and `speed` is clamped, but nothing else is checked.

**Fix:** port `games/farm/server/src/validate-inbound.ts` to `WorkerInbound`. It is a pure function
over one message type and needs no Citadel-specific design — the per-field clamp-or-reject reasoning
is already written down in that file's header.

### 5. A tick fault halts the room with no message to the peers
audit-43 wrapped `step()` so one throwing system no longer takes the whole process down — it stops
the interval and logs. But the peers are simply never spoken to again: there is no equivalent of
Farm's `SimFaultMsg`, so a client sees a frozen screen rather than "the run crashed".

**Fix:** mirror Farm's tick-fault policy end to end — a terminal outbound `fault` frame, and a client
that renders it as a crash. Farm's is in `decisions.md` ("Farm sim-host tick-fault policy").

## What audit-43 FIXED (recorded so it is not re-found)

Four divergences from the Farm server, all closed 2026-09-18:

1. **`speed` had no upper bound.** It is a synchronous loop count inside `setInterval`, so an
   unbounded value was unbounded work in one callback. Now clamped to `MAX_SPEED_MULTIPLIER = 8`,
   the same value Farm uses — deliberately the same, since two sim hosts diverging on a safety
   bound is how this got lost. The host-only check was never a defence: `attach` makes the **first**
   peer to connect the host.
2. **No process-level error handlers and no guard around the tick.** `index.ts` registered only
   `SIGINT`/`SIGTERM`, and `step()` called `scheduler.tick` bare. Both halves added.
3. **No `maxPayload`** — `ws`'s 100 MB default applied while `placeRoad`/`placeWall` looped a
   caller-supplied `tiles` array with no length check, so a single frame controlled how much work
   the tick did. Now 64 KB (Farm's value) plus a `MAX_DRAG_TILES = 4096` cap in the host.
4. **`PlayerState` was never removed on detach.** `nextPlayerId` only incremented and `ensurePlayer`
   only pushed, so every connect left an entry in `sim.state.players` forever (`reset()` fires only
   when the room fully empties) and ~89 sim-core call sites iterate it. `detach` now prunes —
   **safe-only**: a state is removed only when its player owns no buildings and no villagers, so a
   player that built a settlement keeps its state rather than orphaning its holdings. Ids are never
   reused, and nothing depends on `players` indices (every access is `.find(p => p.id === …)` or a
   full iteration, never positional).

## Not debt — do not "fix" these

- **`state.commandLog` is unbounded, and that is correct.** It *is* the save: the locked model is
  "seed + event-sourced input log, not snapshots" ([decisions.md](decisions.md) → Sim), and
  `sim-bootstrap.ts` replays it on load. Truncating it breaks load. Recorded here so the next sweep
  does not re-find it as a leak.

## Also parked with MP

- **The MP villager owner-filter** ([brief 105](../todos/closed/105-citadel-crowd-honesty-mp-owner-filter.md)
  scope 2). `getVillagers()` emits **all** villagers while `population` is per-player — equivalent in
  solo, wrong in MP, where each client renders rivals' villagers as its own crowd. Check raiders and
  armies for the same assumption.
- **The `?mp` render path was never verified.** Brief 108's live pass found no MP-specific render
  entities at all (citadel-38 P1#9): rival buildings, villagers and raiders have never been *seen* on
  a second client.
- **VPS deploy** ([brief 109](../todos/closed/109-citadel-vps-deploy.md)). Note the **solo
  client is a pure static bundle** running its sim in a Web Worker — it needs no server and could be
  deployed on its own today.

## What MP does *not* get back automatically

- **Armies.** Decision **#23** froze `ArmySystem` and flipped `enableArmy` to default `false`. Its
  marching machinery is being reused as the body of the cozy PvE raid
  ([brief 113](../todos/closed/113-citadel-raid-gets-a-body.md)). Reviving MP does **not** revive
  PvP; that is a separate design question, and #15's argument for it (*"cozy MP has no winner, no
  score, no ending — an army has nothing to be for"*) still stands.
- **The 256×256 world.** The server ran it because it was typed into
  [`index.ts:16`](../../games/citadel/server/src/index.ts), not because anyone chose it. Solo now runs
  **192×192** on the merits (decision **#22**). A revived server should adopt the solo size unless it
  argues otherwise.

## Revival checklist

1. Decide who plays it, and what a session is *for*. That question is what deprecated it.
2. Implement the **five** broken things above — **keyed rooms first** (#1 is the one with a security
   consequence), then **#4 input validation** (it is a port, not a design).
3. Re-verify the render path live on two real tabs; it has never been seen working.
4. Confirm the world size, per-room state isolation (`reset()`), and that every mode-affecting option
   round-trips through `CitadelSave` (decision **#19** — two fields were already violating that).

## See also

- [citadel-decisions.md](citadel-decisions.md) — decisions of record; #21–#26 supersede much of #11–#20.
- [brief 108](../todos/closed/108-citadel-live-mp-verification.md) — the only pass that ever drove
  MP live. Its findings are why any of this is known.
