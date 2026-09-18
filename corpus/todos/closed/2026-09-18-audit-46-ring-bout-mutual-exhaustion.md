# audit-46 — A ring bout both fighters lose awards the win, the stake and the trust bond to the challenged party

status: todo
created: 2026-09-18
context: found by the sim-correctness lens of the 2026-09-18 sweep. The `street` branch nine lines
below handles the exact case the `ring` branch is missing, which is what makes this an omission rather
than a rule.

## The gap

[`systems/combat/system.ts:262-276`](../../../games/farm/sim-core/src/systems/combat/system.ts#L262-L276)
— `resolveExhaustion` is entered when **either** side is out of AP, and the ring branch assumes
exactly one is:

```ts
if (bout.context === "ring") {
  const aOut = !aCanSwing;
  const winner = aOut ? b : a;
  const loser  = aOut ? a : b;
  this.applyRingOutcome(winner, loser);
  …
}

// street branch, immediately below — the case the ring branch does not have
if (!aCanSwing && !bCanSwing) {
  this.endBout(bout, { context: "street", winnerId: null, loserId: null, koed: false, fledId: null, looted: 0 });
  return;
}
```

When **both** are exhausted, `aOut` is `true`, so `a` — always `bout.aId`, the initiator — is declared
the loser. `applyRingOutcome` then moves real state: `loser.inventory.gold -= stake;
winner.inventory.gold += stake;` plus a `RING_TRUST_BOND` on both ledgers and an `ONT_COMBAT.RESULT`
broadcast into the event feed.

## Why mutual exhaustion is the common case, not a corner

Ring fights are AP-bound, not HP-bound: `swingIntervalTicks(1200) = 24`, `AP_PER_SWING.fist = 2`, and
`FIST_DAMAGE = 4..9` against a 100-point health pool — so a fist bout runs out of AP long before a KO.
Two farmers entering the ring with equal AP (the normal state at the start of a day phase) alternate
swings, spend 2 AP each per interval, and hit zero on the **same** interval.

Over a 100-day run this is a systematic gold drain on whichever personality initiates ring fights, and
a stream of fabricated win/loss records in the relationship ledger and the event feed.

## What to do

Hoist the mutual-exhaustion draw **above** the ring branch, so the existing `aOut` logic is only
reached when exactly one side is out — which is what it already assumes:

```ts
if (!aCanSwing && !bCanSwing) {
  this.endBout(bout, { context: bout.context, winnerId: null, loserId: null, koed: false, fledId: null, looted: 0 });
  return;
}
```

Check what a `winnerId: null` ring result does downstream before assuming the draw is free — the event
feed, the drama scorer and the rivalry ledger may each have a path that expects a ring bout to have a
winner. If one does, that is part of this brief.

## Files you OWN
- [`games/farm/sim-core/src/systems/combat/system.ts`](../../../games/farm/sim-core/src/systems/combat/system.ts)
- the combat tests in `games/farm/sim-core/src/systems/combat/`
- any downstream consumer that cannot represent a drawn ring bout

## Files you must NOT touch
- `RING_STAKE_GOLD`, `RING_TRUST_BOND`, `AP_PER_SWING`, `FIST_DAMAGE`, `swingIntervalTicks` — this is
  a missing case, not a balance pass. Do not re-tune the ring to make draws rarer.
- the street branch's existing draw — it is the correct model; copy it, don't move it
- `processDayStartReset`'s mid-bout heal — noticed during the sweep and deliberately left alone
  (plausibly the intended daily heal; not this brief's question)

## Acceptance
- **Demonstrate first**: a test that puts two fighters at equal AP one swing from empty and asserts
  the challenger currently loses gold. Then assert it is a draw with no gold moved and no trust delta.
- The one-sided-exhaustion case still resolves exactly as it does today (winner, stake, trust bond) —
  that path must be untouched.
- **This moves the Farm baseline by design** (gold, trust, event feed). Re-verify reproducibility
  (same seed → byte-identical); do not expect equality to pre-change numbers. Small runs
  (`TICKS_PER_DAY=20`, low `MAX_DAYS`); ask before any full determinism check.
