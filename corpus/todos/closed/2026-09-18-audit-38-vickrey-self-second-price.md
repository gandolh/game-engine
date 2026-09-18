# audit-38 — A Vickrey auction can charge the winner their own duplicate bid

status: todo
created: 2026-09-18
context: found by the sim-correctness lens of the 2026-09-18 sweep (audit-38..57). The defect is
stated against the code's **own** documented intent, which is what makes it an oversight rather than
a balance choice.

## The gap

[`systems/auction/system.ts:152-161`](../../../games/farm/sim-core/src/systems/auction/system.ts#L152-L161)
accepts a bid into `vickrey`/`fpsb` with **no dedupe by bidder**:

```ts
case "vickrey":
case "fpsb": {
  if (tick >= a.cfp.closesAtTick) return false;
  a.bids.push({ bidderId: bid.bidderId, amount: bid.amount, tickReceived: tick });
  return true;
}
```

[`resolveVickrey:239-242`](../../../games/farm/sim-core/src/systems/auction/system.ts#L239-L242) then
takes the clearing price from the next slot in the sorted array, with no check that it belongs to a
**different** bidder:

```ts
const cand = sorted[i]!;
if (cand.amount < a.cfp.reservePrice) break;
const next = sorted[i + 1];
const paid = next ? Math.max(next.amount, a.cfp.reservePrice) : a.cfp.reservePrice;
```

The comment four lines above says *"The second price is the next **competing** bid below the
candidate"*. The word `competing` is the invariant, and nothing enforces it.

## Why duplicate bids happen in the normal run

Not a hostile case — the ordinary one:

- the auction window is `Math.round(ticksPerDay * 1.5)` ([`agents/market-wall.ts:55`](../../../games/farm/sim-core/src/agents/market-wall.ts#L55)),
  i.e. **longer than one day**, so every interested farmer deliberates at least twice inside it;
- the `openAuction` belief survives until `closesAtTick` ([`systems/cognition/perceive.ts:101-104`](../../../games/farm/sim-core/src/systems/cognition/perceive.ts#L101-L104));
- the intention queue is wiped and rebuilt every deliberation ([`engine/core/src/agent/deliberate-system.ts:69`](../../../engine/core/src/agent/deliberate-system.ts#L69)),
  and [`agents/bean-valuation.ts:41-56`](../../../games/farm/sim-core/src/agents/bean-valuation.ts#L41-L56)
  unconditionally re-queues an `auction-bid` whenever that belief is present.

So the same farmer bids on every deliberation while the auction is open. With bids
`[300(f3), 300(f3), 110(f7), 110(f7)]`, `i=0` takes `sorted[1]` — farmer 3's **own** second bid — and
charges the winner 300 in a second-price auction whose true second price is 110.

`uniqueParticipants` ([`auction/state.ts:63`](../../../games/farm/sim-core/src/systems/auction/state.ts#L63))
shows the duplicate-bidder case was already known to exist on the participants side; only the price
ladder never got the same treatment.

## What to do

Prefer **replace-on-rebid in `submitBid`** over patching the ladder: it fixes the FPSB walk and the
participants list at the same time, and it makes the "one live bid per bidder" invariant true of the
data rather than of one reader.

```ts
const i = a.bids.findIndex((b) => b.bidderId === bid.bidderId);
if (i >= 0) a.bids[i] = { ... }; else a.bids.push({ ... });
```

Decide explicitly whether a re-bid **replaces** or is **rejected**, and write the choice down — they
differ when a farmer's gold dropped between deliberations.

## Files you OWN
- [`games/farm/sim-core/src/systems/auction/system.ts`](../../../games/farm/sim-core/src/systems/auction/system.ts)
- [`games/farm/sim-core/src/systems/auction/state.ts`](../../../games/farm/sim-core/src/systems/auction/state.ts)
- the auction tests in `games/farm/sim-core/src/systems/auction/`

## Files you must NOT touch
- `agents/bean-valuation.ts` and the personality files — re-bidding per deliberation is the agent
  layer behaving normally; the auction is what must tolerate it
- the `dutch` branch of `submitBid` — it already dedupes via `a.participants` and resolves on first
  clearing bid
- `compareSealedBids`' tie-break — it is a determinism-load-bearing total order

## Acceptance
- **Demonstrate the bug first**, in a test: two bidders, one re-bidding inside the window, asserting
  the winner is currently charged their own bid. (This repo's norm — see
  [audit-37](2026-09-15-audit-37-partial-wasm-build-invisible-to-guard.md): a demo that goes
  red for a different reason has demonstrated nothing.)
- After the fix, that test asserts the runner-up's bid is the clearing price.
- A bidder with exactly one bid is unaffected; a single-bidder auction still pays the reserve.
- **This moves the Farm baseline by design** — gold, standings and the event feed all shift. Re-verify
  reproducibility (same seed → byte-identical), do NOT expect equality to pre-change numbers, and say
  so at closeout. Keep runs small (`TICKS_PER_DAY=20`, low `MAX_DAYS`) and ask before any full
  determinism check.
