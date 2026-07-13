---
summary: Citadel's game-design decisions of record. #21-#26 (2026-07-10, second session) deprecate multiplayer, grow the solo world to 192x192, and reverse #15's PvP relocation — they supersede much of #11-#20 from the same day.
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

> ⚠️ **Read [#21–#26](#2026-07-10-second-grilling-session-21-26) before acting on #11–#20.** Both
> sets were written on 2026-07-10. The later session **deprecated multiplayer**, which was the
> premise the earlier one was built on: #11, #14, #16, #17 and #20 are dead, and #15's reasoning is
> reversed. #12, #13, #18 and #19 survive in modified form. The stale block is kept, not deleted,
> because it is the argument MP will be revived against.

## 2026-07-10 grilling session (#11–#20) — LARGELY SUPERSEDED

Prompted by [brief 108](../briefs/game/done/108-citadel-live-mp-verification.md), the first pass that
ever drove Citadel MP live. **Superseded the same day by #21–#26** — each affected decision carries its
own note below.

### #11 — MP is a real feature, not a future mode
⛔ **DEAD — superseded by #21.** It never survived the question *who plays it*. Nobody chose 256×256 on
its merits either; it was the server's default, and #22 replaces it with a **192×192 solo** world.
Full text + the revival argument: [citadel-mp-deprecated.md](citadel-mp-deprecated.md).

### #12 — The cozy contract holds in MP too
*Reverses brief 32's "town-hall sack = elimination".*

*Nothing you built is taken from you* is a whole-game promise, not a solo one. MP ran cozy PvE
(`cozyThreats` defaults true) beside **lethal** PvP (`enableArmy` defaulted true; `army.ts:127-128`
set `keepSacked` + `gameOver`) — **two defaults colliding, not a design.**

⚠️ **Superseded in part by #15** (soften → remove), then settled by **#23**: `ArmySystem` freezes
outright and `enableArmy` defaults `false`, so the collision is gone at its root.

### #13 — Challenge mode is the home of every sharp system
[Brief 103](../briefs/game/done/103-citadel-challenge-mode.md) is approved and gets built: it owns
`cozyThreats:false` (destructive fire, lethal disease, sacking raids), giving the frozen sharp path a
real consumer so its two-branch test burden stops being dead weight.

> 🔄 **MODIFIED by #24.** Challenge survives as a **solo-only** preset. It no longer owns lethal PvP
> (which had no home once #21 deprecated MP; see #23), so it reduces to `cozyThreats:false`, no
> `seedTown`, no threat-defer. #19's call-site-preset shape lets it shed the MP bundle for free, and
> it is **no longer blocked on anything** — it was only ever gated on the MP arc.

### #14 — Terrain is shipped, not regenerated
⛔ **DEAD — superseded by #21** (unbuilt). The latent late-joiner seed bug it describes is **real and
still present** in the deprecated MP path, unreachable only because nobody runs MP. It is a **revival
precondition** — see [citadel-mp-deprecated.md](citadel-mp-deprecated.md) §2. Recorded, not fixed.

### #15 — Default MP is a co-op sandbox, and armies are removed from it
*Supersedes #12's "soften PvP"; relocates the brief-32 PvP-armies epic wholesale into Challenge mode.*

Cozy MP has **no winner, no score (#7), and no ending (#9)**. There is no `victory`/`winner` anywhere
in `@citadel/sim-core`; the only writers of `gameOver` are `army.ts:128` (rival sack — removed by
#12), `siege-resolution.ts:408` (raider sack — unreachable under cozy defaults) and
`immigration.ts:255` (town dies out — which #9 exists to prevent). So an army has nothing to be *for*,
and softening `launchAttack` into a dent would ship a lever with nothing on the other end.

`ArmySystem` + `launchAttack` come **out** of the cozy path (`enableArmy:false` in the MP server).
Lethal PvP lives only in Challenge (#13). This closes the question "what does a cozy army attack do?":
there isn't one. Work: [brief 112](../briefs/game/superseded/112-citadel-cozy-mp-drop-armies.md).

⚠️ `launchAttack`'s handler is **not gated on `enableArmy`** — it debits tools and pushes an army that
`enableArmy:false` then never resolves. Brief 112 must gate the handler in the same change that flips
the flag, or it *creates* the bug.

> 🔄 **REVERSED by #23.** #15's whole argument was that lethal PvP *relocates* to Challenge mode
> "which must at minimum support MP". With MP deprecated (#21) there is nowhere for PvP to go, so the
> relocation has no destination. `ArmySystem` freezes; its marching machinery is reborn as the *body*
> of the cozy PvE raid. The `launchAttack` gating bug above is retired along with the handler.

### #16 — MP rooms are keyed and invite-only
⛔ **DEAD — superseded by #21** (unbuilt). The **one-room-per-process** hazard it describes is real and
unfixed — a stranger joins *your* game — defused only because nothing hosts Citadel publicly. It is
the revival precondition **with a security consequence**, and therefore the first to implement. See
[citadel-mp-deprecated.md](citadel-mp-deprecated.md) §1.

### #17 — An MP run is ephemeral, by design
⛔ **DEAD — superseded by #21** (unbuilt). `request-save` still hands out a blob that MP cannot load.
Harmless while MP is deprecated; a lie the moment it is revived.
See [citadel-mp-deprecated.md](citadel-mp-deprecated.md) §3.

### #18 — `maxDays` is deleted
A *required* `CitadelSimOptions` field that **no system reads** — every caller passes it, nothing
consumes it, so it reads as a run-length bound and bounds nothing. Removed, not wired. Folded into
[brief 99](../briefs/game/done/99-p2-debt-cleanup-batch.md). ⚠️ `loadFromSave` computes its own value
to pass through; check that path before deleting.

### #19 — A "mode" is a preset at the call site, not a concept in the sim
Challenge mode introduces **no new sim state**. The sim keeps taking flat, independent options
(`cozyThreats`, `enableArmy`, `seedTown`, `deferThreatsUntilBuildings`, `chargeBuildCost`,
`multiplayer`, …); "cozy" and "challenge" are just *bundles* of them chosen by the caller — the solo
worker, the MP server, or a client mode-picker. The sim never learns the word "mode".

This is already the established pattern rather than a new one: `CitadelSave` persists each
mode-affecting flag individually, precisely because `loadFromSave` reconstructs state by re-running
the command log and *the rules must match*. Adding a `mode` enum on top would duplicate that state
and let mode and flags disagree.

Consequences: Challenge-solo and Challenge-MP fall out for free as different bundles; every existing
save keeps loading; and **every mode-affecting option must be persisted in `CitadelSave`.** That last
clause is load-bearing — see the trap below.

> ⚠️ **The invariant has teeth.** Brief 108 added `multiplayer` and didn't persist it; the round-trip
> test then found a larger omission — **world dimensions were never persisted either**, so
> `loadFromSave` rebuilt the default grid and silently dropped every replayed command out of its
> bounds. Fixed 2026-07-10 (`19d6d98`). When Challenge adds flags, persist them and write the test.

### #20 — Sequencing: finish the Citadel MP arc first
⛔ **DEAD — superseded by #26.** There is no MP arc. The new order is #26.

## 2026-07-10 second grilling session (#21–#26)

Ran hours after #11–#20, against the same code. The earlier session answered *how do we make MP
correct*; this one asked the question underneath it — **who plays it** — and did not find an answer.
**#21 is the root; #22–#26 are its consequences.**

### #21 — Multiplayer is deprecated, not deleted
*Reverses #11 ("MP is a real feature"), and with it #14, #16, #17 and #20.*

Cozy MP has no score (#7), no ending (#9), no armies (#15), and no save (#17). Asked who the session
is *for*, the answer was: nobody yet. Shipping [111](../briefs/game/superseded/111-citadel-mp-room-keys-and-session-semantics.md)
(room keys) and [109](../briefs/game/superseded/109-citadel-vps-deploy.md) (VPS) would have been four
briefs of infrastructure serving no player.

**Deprecated, not deleted.** `@citadel/server`, the client's `?mp` path, and `CitadelSimHost` all stay
in the tree and keep compiling and passing tests. They are unmaintained and known-broken in the ways
#14, #16 and #17 describe. **The revival preconditions are those three decisions**, and they are kept
on the page for exactly that reason. Anyone reviving MP starts by reading them, not by reading code.

### #22 — The solo world grows to 192×192
*Replaces #11's "committed 256×256", which was the server's default rather than a choice.*

96×96 was never argued for either. 192×192 is chosen on the merits, and specifically as **the smallest
size that crosses the `4096²` iso-pixel windowing threshold** (`6144×3088`, 76 MB RGBA) — so brief
110's part 1, and briefs 21/22's windowed bake behind it, stop being dead code. 160×160 would have
grown the map without triggering windowing; 256×256 sits exactly on WebGPU's default
`maxTextureDimension2D` of 8192 px with zero margin. The full size table is in
[brief 110](../briefs/game/done/110-citadel-client-world-size.md).

A settlement occupies ~40×40 tiles regardless, so this trades map occupancy (17% → 4%) for longer
roads to clustered resources — which is #10's "build toward the resource" decision made larger.

### #23 — Armies freeze; the cozy raid gets a body instead
*Reverses #15's relocation, which had a destination only while MP existed.*

`ArmyState` is PvP **down to its fields** — `attackerId` is a player, `targetPlayerId` a building's
owner, `findTargetBuilding` filters on `ownerId`. There is no AI attacker to repoint it at without
rewriting the state, the targeting and the resolution. Meanwhile `applyRaidDamage`
([siege-resolution.ts:200](../../games/citadel/sim-core/src/systems/siege-resolution.ts)) already does
the PvE job — so "keep armies for solo raiders" would rebuild a system Citadel has.

What armies have that raids don't is **a body**: `ArmyState` carries `x, y, tileX` — a unit that
marches, where the cozy raid is an abstract `raidStrength` applied at the keep. So the machinery is
reborn as the raid's *embodiment* — raiders you watch approach, pilfer, and leave, exactly as the cozy
rules already say. Diegetic feedback (#8, #10), not a new mechanic.

`ArmySystem` + `launchAttack` freeze behind `enableArmy`, **default flipped to `false`**, unreached by
any caller. ⚠️ Gate the handler in the same change as the flip, or you create the unbounded
`state.armies` bug #15 warned of. Work: [brief 113](../briefs/game/done/113-citadel-raid-gets-a-body.md).

### #24 — Challenge mode is solo-only
See the note on #13. It sheds lethal PvP (#23) and the MP bundle (#21), keeping `cozyThreats:false`,
no `seedTown`, no threat-defer. Unblocked; still unbuilt.

### #25 — Solvability guarantees distance, not just reachability
`repairSolvability` guarantees ≥1 **reachable** Forest and Stone by 4-connected flood-fill. On 96×96
the map bounds the distance. On 192×192 it does not — a guaranteed stone can sit 100 tiles from the
core box, across terrain you must road toward with wood you do not have. **The Phase C cold open would
open on a living town that cannot grow**, and no existing test would see it.

The guarantee gains a distance bound: ≥1 Forest and ≥1 Stone within **N tiles of the core box**,
painting a blob if absent. Pure function of the grid, no RNG — the same shape as today's guarantee.
Verified across 100 seeds. N is calibrated from the measured distribution, not assumed.

### #26 — Sequencing: the world before the economy
**110 (reshaped) → 100 → the tail.** Brief 100's balance numbers are meaningless on a map that is
about to quadruple, so the world lands first. Then the tail: 102, 99, 106, 104, 105 (crowd half), 98.

Deprecated or parked with reasons: 109, 111, 112 (superseded); 101, 107, engine 18, engine 19 (parked).

## 2026-07-13 (brief 103 closeout)

### #27 — Retired decrees re-point to autonomous sharp-mode behaviors, not a resurrected lever
The Phase-G purge removed the `setDecree` command/UI but left three branches reading `p.activeDecrees` —
a set nothing writes anymore, so they were dead in real play. Brief 103 scope 2 asked whether Challenge
should get decrees back or the sharp systems should read something else. **Decision: re-point, don't
resurrect.** Each former decree becomes an autonomous behavior gated on the sharp path (`cozyThreats:false`),
so the cozy baseline is byte-identical *by construction* (the branches never execute when `cozy=true`):
- **conscription** → wall-manning defense term applies during an active raid in sharp mode
  (`computeDefensiveStrength` gained a `cozy` param).
- **rationing** → 25% consumption cut auto-engages only in sharp mode *and* only in bread deficit
  (a reactive famine response, not a standing cut).
- **tithe → relief-reserve cushion** → siphons **bread only** (`floor(bread·0.10)`/day) into the reserve
  in sharp mode. Bread-only, not all-goods: the cushion only ever withdraws `reliefReserve.bread`, so
  taxing tools/wood/stone was a purposeless drag (and silently eroded `army.test.ts`'s exact tool counts).

Follows the same shape as the earlier Phase-G re-points (festival → public-square proximity, work-hours →
town-hall proximity): a player toggle becomes an autonomous, state-driven effect. `activeDecrees` itself is
left in place (a harmless always-empty set + snapshot passthrough); removing it is a separate cleanup.

## Consequences at a glance

| Brief | Status after the second session |
|---|---|
| [110](../briefs/game/done/110-citadel-client-world-size.md) world size | **DONE** (`0fd66c0`, after part 1 `8e930f3`). Reshaped: *solo grows to 192*, not *client adopts server*. |
| [100](../briefs/game/done/100-citadel-economy-growth-pass.md) economy growth | **DONE** 2026-07-10. Curve `0.6 → 1.0 → 1.25` shipped; `grow` 60d pop **12**/18, in the 12–15 target. |
| [113](../briefs/game/done/113-citadel-raid-gets-a-body.md) raid gets a body | **New** (#23). Filed, not built. |
| [103](../briefs/game/done/103-citadel-challenge-mode.md) Challenge mode | **DONE** 2026-07-13 (`c2caecc`). Solo-only (#24); decrees re-pointed (#27). |
| [105](../briefs/game/done/105-citadel-crowd-honesty-mp-owner-filter.md) crowd honesty | Reshaped: ambient-crowd half only. The MP owner-filter half is deprecated with MP. |
| [111](../briefs/game/superseded/111-citadel-mp-room-keys-and-session-semantics.md) room keys | **Superseded** (#21). Its hazard is real; it is a revival precondition. |
| [112](../briefs/game/superseded/112-citadel-cozy-mp-drop-armies.md) drop armies from cozy MP | **Superseded** (#23). Moot — there is no cozy MP. The `enableArmy` default flip survives into 110. |
| [109](../briefs/game/superseded/109-citadel-vps-deploy.md) VPS deploy | **Superseded** (#21). Nothing to deploy. |
| [99](../briefs/game/done/99-p2-debt-cleanup-batch.md) P2 debt | Keeps the `maxDays` deletion (#18 survives). |
| [98](../briefs/game/done/98-farm-market-wall-wire-or-remove.md) Farm market wall | **Option A, wire it.** Farm is in maintenance; this and 99's Farm slice are its whole scope. |
| [101](../briefs/game/todo/101-farm-perishability-distance-pricing.md) · [107](../briefs/game/todo/107-farm-visual-verification-session.md) | Parked. Farm is in maintenance; 101 forbids autonomous execution, 107 needs the user's real GPU. |
| engine [18](../briefs/engine/todo/18-ui-authored-typography-and-icons.md) · [19](../briefs/engine/todo/19-audio-subsystem.md) | Parked. Net-new subsystems, independent of everything above. |

**Order (#26):** 110 → 100 → {102, 99, 106, 104, 105, 98}.
