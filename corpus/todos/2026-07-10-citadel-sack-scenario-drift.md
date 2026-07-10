# Citadel `sack` scenario no longer sacks (pre-existing drift)

status: **todo — unowned bug.** Captured 2026-07-10 during the remaining-work planning pass.
Blocks: [brief 103](../briefs/game/todo/103-citadel-challenge-mode.md).
Risk to: [brief 113](../briefs/game/todo/113-citadel-raid-gets-a-body.md).

## What

The headless scenario `SCENARIO=sack` in
[tools/citadel-sim/src/index.ts](../../tools/citadel-sim/src/index.ts) is designed to end
with the keep sacked and `gameOver` set — "keep alone, `defenseStrength` 8, no extra defenses
→ sacked on raid 4" ([index.ts:495](../../tools/citadel-sim/src/index.ts)). It no longer
reaches that state.

## How it surfaced

Brief 100's closeout (2026-07-10) needed the sibling `starve` scenario and found *it* had
also stopped starving; that fixture was deliberately re-laid and now starves for a
principled reason. In the same breath the closeout recorded, parenthetically:

> `sack` already failed to sack **before** this brief — pre-existing drift.

So it was observed, correctly attributed as *not* caused by brief 100, and then nobody
chased it. No brief owns it.

## Why it matters

`sack` is the only fixture that exercises the **sharp** (`cozyThreats:false`) raid resolution
end to end. That path has been frozen since the 2026-06-28 cozy pivot, guarded only by a
byte-identity regression test — which proves the path *hasn't changed*, not that it *works*.

- **[Brief 103](../briefs/game/todo/103-citadel-challenge-mode.md) (Challenge mode) is
  blocked.** Its acceptance is "challenge run playable start→**sack**-or-survive" and "raid
  can sack". Challenge mode *is* the sharp path's first real consumer. It cannot be signed
  off while the fixture that demonstrates a sack doesn't.
- **[Brief 113](../briefs/game/todo/113-citadel-raid-gets-a-body.md) inherits the risk.** It
  rehomes the army's marching machinery onto the raid, and requires the sharp resolution stay
  "reachable, byte-identical". If the sharp resolution is *already* not reachable, that
  acceptance criterion is vacuously true and 113 will build a body on a broken skeleton.

## Where to look

Start by running it and reading the tier decision, not by reading the code:

```bash
SCENARIO=sack MAX_DAYS=40 npm run sim:citadel
```

The scenario's own comments encode the intended arithmetic — verify the code still agrees:
- [index.ts:468-476](../../tools/citadel-sim/src/index.ts) — "defense=8, raid=10: 8 < 15
  (repelled threshold), 8 >= 5 → *damage* tier, not sacked yet on first hit … else sacked.
  The keep is sacked with economy still alive."
- `applyRaidDamage` ([siege-resolution.ts:200](../../games/citadel/sim-core/src/systems/siege-resolution.ts))
  — the repelled / damage / sacked tier thresholds.

Prime suspects, in order:
1. **The cozy pivot (Phase D, 2026-07-01)** gated the destructive path behind
   `cozyThreats` (default **ON**). Check the scenario actually passes `cozyThreats:false` —
   if it doesn't, it has been silently running the cozy "pilfer and leave" resolution, which
   by contract *never* sacks, and the fixture has been meaningless since that day.
2. **Brief 97 chunk 4** changed `applyRaidDamage`'s removal path (`releaseWorkersAt`).
3. **Defense-strength drift** — some later brief raised the keep's base defense or the
   raid bands, moving `defense=8, raid=10` out of the damage tier.

Suspect 1 is the cheapest to check and the most likely.

## Done when

- `SCENARIO=sack` reaches `gameOver=true` again (or the scenario is deliberately re-laid,
  like `starve` was, and the closeout says why).
- A test — not just a scenario — asserts the sharp raid path can reach the `sacked` tier, so
  this cannot rot silently a second time.
- The `cozyThreats:false` regression guard is understood to prove *unchanged*, not *working*;
  say so wherever it's cited.
