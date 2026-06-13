# Game Task 01 — Three Farmer Personalities + CNP Buying

**Status:** Done
> Condensed 2026-06-13 — original spec in git history.

Port the three remaining farmer personalities (Conservative was already done) and implement CNP (Contract Net Protocol) as a buying initiator for the Hoarder. Dispatch via the existing `registerPersonality` registry.

## What shipped

- **`agents/aggressive.ts`** — `risk: high`, `minGoldReserve: 10`. Plants most profitable crop affordable (pumpkin > wheat > radish, downgrades in storm/rain). Every 2 days posts inventory at `priceMax` and scans wall for offers below 90% of shop price.
- **`agents/opportunist.ts`** — `risk: medium`, `minGoldReserve: 50`. Crop choice driven by weather forecast. Posts at fair price only when supply for that crop is low (<3 offers); otherwise dumps to shopkeeper. Buys at most one offer/day from highest-trust seller ≤110% shop price.
- **`agents/hoarder.ts`** — `risk: high`, `minGoldReserve: 80`. Plants pumpkin/corn alternating by plot id. Every 3 days broadcasts a CNP CFP to peers to buy radishes; after deadline picks cheapest proposal (lowest `pricePerUnit`, tie-break by lowest `bidderId`), sends ACCEPT to winner + REJECT to losers. Also buys market-wall offers up to 105% of shop price ordered by trust score.
- **`agents/cnp-coordinator.ts`** — pure state machine (no system loop). State per task: `{ taskId, initiatorId, status: "open"|"collecting"|"awarded"|"completed", proposals, deadlineTick }`. Methods: `startTask`, `acceptProposal`, `closeTask` (returns winner or null). Deterministic winner: lowest price, lowest id tie-break.
- Each personality file registers via `registerPersonality(name, fn)` at module load.
- New intention kinds enqueued (consumed by downstream systems — Game Task 03): `cnp-initiate`, `cnp-respond-bid`, `post-offer`, `read-offers`, `buy-from-wall`. Shapes mirror protocol body types in `protocols/market.ts` and `protocols/cnp.ts`.
- `farmer.trust?.byId: Map<number, number>` used; initial value 0.5 for unseen peers; updates deferred to a future ticket.
- Tests for each personality (intent production given beliefs/inventory) and `cnp-coordinator.test.ts` (3-proposal close, cheapest-with-lowest-id winner).
