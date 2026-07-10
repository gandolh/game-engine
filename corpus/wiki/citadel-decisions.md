---
summary: Citadel's game-design decisions of record (#11-#18, 2026-07-10) — what MP is, who it's for, and what that removes. Four of them reverse earlier commitments.
updated: 2026-07-10
---

# Citadel — Decisions of Record

Game-design decisions, numbered. **These win over any older text**, including
[citadel-overview.md](citadel-overview.md)'s 2026-06-28 cozy-pivot block and any
`todos/`/`briefs/` written before them. Tech choices (stack, ECS, renderer, palette) live in
[decisions.md](decisions.md) instead — this page is about *what the game is*.

**#1–#10** are the 2026-06-28 cozy pivot; they remain in force and are summarised in
[citadel-overview.md](citadel-overview.md) (notably **#7** no score / no quest list, **#8** the
player's hand is placement + economic intent, **#9** the downside rule — every problem is a
throttle-to-floor, never a loss, **#10** terrain is the puzzle).

## 2026-07-10 grilling session (#11–#18)

Prompted by [brief 108](../briefs/game/done/108-citadel-live-mp-verification.md), the first pass that
ever drove Citadel MP live. **#11, #12, #15 and #16 reverse earlier commitments.**

### #11 — MP is a real feature, not a future mode
*Reverses "MP/PvP is a future mode, not the core" (2026-06-28).*

The committed **256×256** world stays. The client must adopt the server's world size —
[brief 110](../briefs/game/todo/110-citadel-client-world-size.md). Until it lands, MP renders only a
96×96 corner of its world. Unblocks [105](../briefs/game/todo/105-citadel-crowd-honesty-mp-owner-filter.md)
(owner filter) and [109](../briefs/game/todo/109-citadel-vps-deploy.md) (deploy).

### #12 — The cozy contract holds in MP too
*Reverses brief 32's "town-hall sack = elimination".*

MP keeps `cozyThreats` default-on. *Nothing you built is taken from you* is a whole-game promise, not
a solo one. Today MP runs cozy PvE (`cozyThreats` defaults true) beside **lethal** PvP (`enableArmy`
defaults true; `army.ts:127-128` sets `keepSacked` + `gameOver`) — **two defaults colliding, not a
design.** The server passes neither option.

⚠️ **Superseded in part by #15**: the original answer was to *soften* the army attack into a dent.
#15 removes the army from cozy MP instead, so there is no cozy attack to define.

### #13 — Challenge mode is the home of every sharp system
[Brief 103](../briefs/game/todo/103-citadel-challenge-mode.md) is approved and gets built. It owns
`cozyThreats:false` (destructive fire, lethal disease, sacking raids) **and** the lethal PvP armies
that #15 removes from cozy MP. This finally gives the frozen sharp path a real consumer, so its
two-branch test burden stops being dead weight.

*Open:* whether Challenge is *also* a solo difficulty, and whether it is one flag or two — see
[open-questions.md](open-questions.md).

### #14 — Terrain is shipped, not regenerated
The MP server sends the terrain grid **once** (256×256 = 65,536 bytes; `perMessageDeflate` is already
on above 1 KiB and terrain compresses hard). The client must **never** generate its own world in MP.

This makes terrain desync **structurally unrepresentable**, and retires a latent bug the alternative
would have preserved: `init` carries the *client's* hardcoded `SEED`, and only the **first** peer's
seed starts the sim, so a late joiner regenerating from its own constant would silently render a
different world.

### #15 — Default MP is a co-op sandbox, and armies are removed from it
*Supersedes #12's "soften PvP"; relocates the brief-32 PvP-armies epic wholesale into Challenge mode.*

Cozy MP has **no winner, no score (#7), and no ending (#9)**. There is no `victory`/`winner` anywhere
in `@citadel/sim-core`; the only writers of `gameOver` are `army.ts:128` (rival sack — removed by
#12), `siege-resolution.ts:408` (raider sack — unreachable under cozy defaults) and
`immigration.ts:255` (town dies out — which #9 exists to prevent). So an army has nothing to be *for*,
and softening `launchAttack` into a dent would ship a lever with nothing on the other end.

`ArmySystem` + `launchAttack` come **out** of the cozy path (`enableArmy:false` in the MP server).
Lethal PvP lives only in Challenge (#13). This closes the question "what does a cozy army attack do?":
there isn't one. Work: [brief 112](../briefs/game/todo/112-citadel-cozy-mp-drop-armies.md).

⚠️ `launchAttack`'s handler is **not gated on `enableArmy`** — it debits tools and pushes an army that
`enableArmy:false` then never resolves. Brief 112 must gate the handler in the same change that flips
the flag, or it *creates* the bug.

### #16 — MP rooms are keyed and invite-only
*Reverses the implicit "one shared world" the code ships today.*

Peers join `?mp=<roomId>`; the host keys rooms by id, porting the Farm `RunRegistry` pattern that
citadel-38 item 7 already names as the model this server diverges from. Today it is **one room per
process** — every peer who connects lands in the *same* game — so a stranger could wander into your
town the moment [109](../briefs/game/todo/109-citadel-vps-deploy.md) puts it on a public box. The room
id is a **capability, not a secret**: this is invite-by-link, not authentication. Work:
[brief 111](../briefs/game/todo/111-citadel-mp-room-keys-and-session-semantics.md).

### #17 — An MP run is ephemeral, by design
It lives as long as someone is connected (10 s reap grace, verified live in brief 108). `load-save`
stays refused in a shared room — it would desync live peers — and the misleading `request-save` (which
hands a peer a blob nothing in MP can load) is removed or gated. A match is session-shaped; that is
the intent, not an omission. Folded into brief 111.

### #18 — `maxDays` is deleted
It is a *required* `CitadelSimOptions` field that **no system reads**: every caller passes it and
nothing consumes it, so it reads as a run-length bound and bounds nothing (a live MP room sailed past
day 200). Removed, not wired — MP is endless by #15. Folded into
[brief 99](../briefs/game/todo/99-p2-debt-cleanup-batch.md). Note `loadFromSave` computes its own
value to pass through; check that path before deleting.

## Consequences at a glance

| Brief | Status after this session |
|---|---|
| [110](../briefs/game/todo/110-citadel-client-world-size.md) client world size | **Next up.** Gates 105 and 109. |
| [111](../briefs/game/todo/111-citadel-mp-room-keys-and-session-semantics.md) room keys + session semantics | New. Also gates 109. |
| [112](../briefs/game/todo/112-citadel-cozy-mp-drop-armies.md) drop armies from cozy MP | New. Sequence with 103. |
| [103](../briefs/game/todo/103-citadel-challenge-mode.md) Challenge mode | Approved; now owns lethal PvP. Scoping blocked on the open flag question. |
| [109](../briefs/game/todo/109-citadel-vps-deploy.md) VPS deploy | Gated on 110 **and** 111. Solo half deployable today. |
| [99](../briefs/game/todo/99-p2-debt-cleanup-batch.md) P2 debt | Gains the `maxDays` deletion (#18). |
| [98](../briefs/game/todo/98-farm-market-wall-wire-or-remove.md) Farm market wall | Decided: **Option A, wire it.** |
