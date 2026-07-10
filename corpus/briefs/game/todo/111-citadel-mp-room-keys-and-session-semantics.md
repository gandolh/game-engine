# Brief 111 — Citadel MP room keys + honest session semantics

status: todo — **gates [brief 109](109-citadel-vps-deploy.md).** Decisions **#16** and **#17** (2026-07-10).
source: the 2026-07-10 grilling session, grounded in code read during [brief 108](../done/108-citadel-live-mp-verification.md).

## The finding

Two facts about the MP server that nobody chose, and that only matter once Citadel is public:

1. **One room per process.** [`games/citadel/server/src/index.ts`](../../../../games/citadel/server/src/index.ts)
   constructs a single `CitadelSimHost`, and every WebSocket peer `attach`es to it. Its own header
   says *"One authoritative multi-writer room per server process (a multi-room lobby is a
   follow-up)."* So **every peer who connects joins the same game**. On a public VPS
   (brief 109) a stranger can place, demolish, and — until [brief 112](112-citadel-cozy-mp-drop-armies.md)
   lands — march armies inside your settlement.
2. **An MP run cannot be recovered.** `request-save` hands the asking peer a save blob
   ([sim-host.ts:205-206](../../../../games/citadel/server/src/sim-host.ts)), but `load-save` is a
   deliberate no-op in a shared room — *"Not supported on a shared multi-writer room (would desync
   live peers)"* — and `reset()` fires 10 s after the last peer leaves. So the blob is a lie: MP
   hands you a save that nothing in MP can load.

## Decisions this brief implements

- **#16 — rooms are keyed and invite-only.** Peers join `?mp=<roomId>`. Port the Farm `RunRegistry`
  pattern, which [citadel-38 item 7](../../../todos/closed/2026-06-19-citadel-38-implementation-review-problems.md)
  already names as the model this server *diverges from*. The reap/grace machinery in
  `CitadelSimHost` is right; what's missing is the keyed registry above it.
- **#17 — an MP run is ephemeral, by design.** It lives as long as someone is connected. Keep
  `load-save` refused while peers are attached. **Remove or gate `request-save` in MP** so the API
  stops promising recoverability it does not have, and say so in the corpus rather than leaving the
  next reader to discover it from a silent `return`.

## Scope

1. A `CitadelRunRegistry` keyed by room id: `get(roomId)` → existing host, or create. Reap a room
   when it is empty past the grace, exactly as `CitadelSimHost.armReap`/`reset` does today — the
   per-room lifecycle is already correct and **verified live** (brief 108: rejoin at 3.1 s keeps the
   run, at 12 s gets a fresh one). Do not rewrite it; lift it.
2. Client: read `?mp=<roomId>` (generate a short random id when absent and reflect it into the URL so
   it can be shared). ⚠️ The id is a **capability**, not a secret — say so; this is invite-by-link,
   not authentication.
3. Remove `request-save` from the MP path (or gate it behind "host, and room empty"); leave solo's
   save/load untouched — solo *is* the sim, and its save/load is verified working.
4. Document the session model in [citadel-overview.md](../../../wiki/citadel-overview.md): a match is
   session-shaped and dies with its last peer.

## Acceptance

- Two browsers on `?mp=alpha` share a world; a third on `?mp=beta` gets its own, concurrently, in the
  same server process. A peer on `?mp=alpha` cannot observe or affect `beta`.
- Rejoining `?mp=alpha` inside the grace window resumes the live run; after it, a fresh one — the
  brief-108 result, now per-room.
- `request-save` no longer returns a blob in MP (or is host+empty-gated). Solo save/load unchanged.
- Reaping one room does not disturb another (the current `reset()` clears process-wide state —
  `nextPlayerId`, `hostPeer`, `bots` — so this needs care).
- `npm run typecheck` + `npm run test` green; the existing `run-lifecycle.test.ts` /
  `sim-host.test.ts` / `mp-authority.test.ts` still pass, extended to two concurrent rooms.

## Notes

- Sequence with [110](110-citadel-client-world-size.md): independent (110 is render-side, this is
  transport/lifecycle) but **both gate [109](109-citadel-vps-deploy.md)**. Do 110 first — it is the
  one that makes MP *look* right; this one makes it *safe to expose*.
- `reset()` currently nulls `hostPeer` and `nextPlayerId` and empties `bots` — process-global state
  that must become per-room. Grep it before assuming the lift is mechanical.
