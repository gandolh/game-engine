# Brief 112 — Remove armies from cozy MP (relocate PvP to Challenge mode)

> ⛔ **SUPERSEDED 2026-07-10 (second grilling session) — never built. Moot.** Decision **#21**
> deprecated multiplayer, so there is no cozy MP to remove armies *from*, and decision **#23** reversed
> #15's premise: with no MP there is nowhere for lethal PvP to relocate *to*. `ArmySystem` simply
> freezes.
>
> **Two pieces of this brief survive and were rehomed, not lost:**
> - The **`enableArmy` default flip to `false` + gating the `launchAttack` handler** (scope 2/3 below)
>   moves to [brief 110](110-citadel-client-world-size.md) scope 7. The trap it warns about — the
>   handler debits `tools` and pushes an `ArmyState` that an unregistered `ArmySystem` never resolves,
>   so `state.armies` grows without bound — is **real** and must be defused with the flip.
> - The army's **marching machinery** is salvaged by [brief 113](113-citadel-raid-gets-a-body.md),
>   which gives the existing cozy PvE raid a visible body.

status: superseded — was: todo. Decision **#15** (2026-07-10, first session), reversed by #23.
source: the 2026-07-10 grilling session. Superseded decision #12's "soften PvP into a dent".

## Why

Cozy MP has **no winner, no score (#7), and no ending (#9)**. Grep confirms it: there is no
`victory`/`winner` anywhere in `@citadel/sim-core`, and the only three writers of `gameOver` are
`army.ts:128` (a rival sacks your hall), `siege-resolution.ts:408` (raiders sack your keep —
unreachable under cozy defaults, which pilfer and leave), and `immigration.ts:255` (your town dies
out — which decision #9's "no death spiral" exists to prevent).

Decision **#12** removed the first of those. That leaves an army mechanic that cannot win, cannot
lose, and cannot end anything — a lever with nothing on the other end. Softening `launchAttack` into
"a dent" would ship exactly that. **#15** takes the honest route: cozy MP has no armies. Lethal PvP
is not deleted, it moves to Challenge mode (#13), where a run *can* end and the mechanic means
something.

This does not undo the brief-32 PvP epic — it **relocates** it. The siege math, `launchAttack`,
army movement and resolution all keep working; they simply stop being reachable from the cozy path.

## Scope

1. **`@citadel/server`**: pass `enableArmy: false` in `CitadelSimHost.start()`. The option already
   exists and already gates `ArmySystem` registration
   ([sim-bootstrap.ts](../../../../games/citadel/sim-core/src/sim-bootstrap.ts): *"Gated on
   `enableArmy` (default true; the solo/cozy client passes false…)"*). Cozy MP joins solo in
   passing false.
2. **Gate `launchAttack` on `enableArmy` — do this in the SAME change as step 1, or you ship a bug.**
   ⚠️ The handler ([sim-bootstrap.ts:779-822](../../../../games/citadel/sim-core/src/sim-bootstrap.ts))
   is **not** gated on `enableArmy`. It debits `attacker.stockpiles.tools -= strength`, then pushes an
   `ArmyState` into `state.armies`. `enableArmy:false` only unregisters `ArmySystem` — so the army is
   **never resolved, never removed**, the tools are gone, and `state.armies` grows without bound.

   This is latent today: the handler returns early unless a *rival's* building is targeted
   (`defenderId === attacker.id` ⇒ no friendly fire), so a one-player solo sim can never reach it, and
   MP currently runs `enableArmy:true`. **Step 1 makes it reachable.** Reject the command explicitly
   the way peer-sent `setActivePlayer` is rejected (citadel-38 P0#3). Otherwise this is brief 98's
   Farm market wall all over again: intents queued, cost paid, nothing resolves.
3. **`enableArmy` default → `false`.** Once cozy solo *and* cozy MP both pass false, the only caller
   wanting true is Challenge mode and `army.test.ts`. Flip the default so the safe mode is the
   default and Challenge opts *in*. (Check `army.test.ts` + `pve-gift.test.ts` — they bootstrap with
   defaults today.)
4. Client: hide/disable any launch-attack affordance in cozy MP. Confirm one exists first — brief
   108's live pass found no MP-specific render entities at all (citadel-38 P1#9), so this may be a
   no-op.

## Acceptance

- A cozy MP room registers no `ArmySystem`; a peer sending `launchAttack` is **rejected**, not
  silently ignored, and nothing in `state.armies` ever populates.
- `army.test.ts` passes with an explicit `enableArmy: true` (Challenge's configuration), proving the
  math is relocated and not broken.
- No player can end another player's run in cozy MP: `gameOver` is unreachable except by a town
  dying out. Add a test that asserts exactly that — it is the cozy contract, in code.
- Solo unchanged (it already passes `enableArmy:false`). Headless/determinism baseline unchanged —
  `ArmySystem` is a no-op in a one-player sim, so removing it should be byte-identical. **Prove it**
  (multi-seed `EXPORT=json`), don't assume.
- `npm run typecheck` + `npm run test` green.

## Notes

- Territory (`enforceTerritory: true` in MP) **stays**: in a co-op sandbox it still gives each player
  their own area to build outward from, which is what brief 29's town-hall anchor is for. Only the
  *attack* goes.
- The town-hall keep-anchor fix from [brief 108](../done/108-citadel-live-mp-verification.md) remains
  load-bearing after this: raids still target `keepPosition` (they pilfer), so the founder's hall must
  still anchor.
