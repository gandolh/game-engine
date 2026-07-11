# Citadel `sack` scenario no longer sacks (pre-existing drift)

status: **CLOSED 2026-07-11.** Commits `7c76522` + `36382d2`. Unblocks
[brief 103](../briefs/game/todo/103-citadel-challenge-mode.md); de-risks
[brief 113](../briefs/game/todo/113-citadel-raid-gets-a-body.md).

> **Resolution 2026-07-11 — it was not "drift". It was four defects, and the fixture was
> structurally inert, not subtly off.**
>
> 1. **`cozyThreats` defaults to `true`.** Under the cozy contract a raid pilfers and leaves —
>    it *can never sack*. The `siege`/`sack` scenarios never passed the flag, so **from the day
>    the cozy pivot landed (2026-07-01) they silently asserted nothing.** Fixed: both scenarios
>    now opt into the sharp path explicitly.
> 2. **The keep is Town-locked** (`TIER_LOCK.keep = "Town"`), but the scenario ordered it on
>    **day 0 at Hamlet**, so `placeOne` rejected it. No keep → `RaidSpawnSystem` short-circuits
>    on `keepPosition === null` → no raid clock, no threat, no raiders, nothing to sack.
>    **This was not a silent reject** — the run *printed* `a keep needs Town tier`, then exited
>    **0** and printed a cheerful economy summary. The fixture logged its own failure and
>    reported success. That, not silence, is the trap.
> 3. **`popCap 6` vs the promised 24 was *created* by fixing #1.** Turning the sharp path back
>    on also un-gates **sharp fire**, which razes buildings instead of smouldering; the old
>    3-tile pitch put every house inside `FireSystem`'s Manhattan-4 ignition window. The town
>    burned its own houses down. Cozy fire had been masking a layout that could not survive the
>    rules the fixture claims to test.
> 4. **Brief 110 doubled the world to 192×192.** Raiders march ~6.7 tiles/day from a **map
>    edge**, so a raid is now **~15 days in transit, not ~7**. The scenario's "raid 4 arrives
>    ~day 27.5 → within 40 days" comment was arithmetic done on the 96×96 map and quietly
>    stopped being true. The sack now legitimately lands on **day 50**; `sack` defaults to
>    **70 days** (`SACK_MAX_DAYS`), and `MAX_DAYS=40` now **fails loudly** rather than passing
>    vacuously.
>
> **The fix is a real playthrough, not a forced flag.** Tier was deliberately **not**
> pre-unlocked — `TIER_LOCK` is the gate Challenge (103) must honour, and pre-unlocking would
> have asserted *around* the mechanism that broke. Instead the town is re-laid for a principled
> reason (the brief-100 `starve` precedent): a **4-column / 5-row lattice** holds every wooden
> building to **≤2 wooden neighbours** inside the ignition window, so spontaneous fire is
> *structurally impossible*. The town is fireproof **by layout** — which is exactly the lesson
> sharp fire exists to teach. It then grows honestly, earns Town on day 12, and raises the keep
> through the real gate. The fixture now prints `SACK: PASS/FAIL` and **exits 1 on failure**.
>
> ## The finding worth carrying forward
>
> **Two sharp-sack tests already existed and passed for the entire time the fixture was rotting**
> (`phase4.test.ts` "an undefended keep is eventually sacked"; `cozy-threats.test.ts` "still
> sacked with `cozyThreats:false`"). They pass because they **poke `lp.tier = "Town"` directly**
> before placing the keep, walking straight past `TIER_LOCK`. So the sharp *resolution* was never
> broken — its **reachability** was, and **no test could see it**.
>
> Three different guards, three different claims, and the gap between them is where this lived:
> - the byte-identity guard proves the sharp path is **unchanged**;
> - those two tests prove **the math still works**;
> - **nothing proved a player could get there.**
>
> The new `sharp-raid-path.test.ts` covers exactly that third claim: it **never assigns `tier`**,
> and it fails if any link in `grow → earn Town → keep clears TIER_LOCK → raid clock anchors →
> raider marches → sacked` breaks. Scope notes were added to both older guards so the next reader
> does not mistake "unchanged" or "the math works" for "it works".

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
