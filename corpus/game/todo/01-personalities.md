# Game Task 01 — Three Farmer Personalities + CNP Buying

## Context

"Farm Valley" is a TypeScript port/extension of a Python SPADE multi-agent sim. Four farmer personalities exist in the original: **Conservative** (already ported), **Aggressive**, **Hoarder**, **Opportunist**. Your job is to port the remaining three. The Hoarder also implements the **Contract Net Protocol (CNP)** as an initiator to buy crops from peers.

The dispatch mechanism is a **registry** (already built). Each personality file registers itself at module load time via `registerPersonality(name, deliberateFn)`.

## Files you OWN

- `packages/farm-valley/src/agents/aggressive.ts` (create)
- `packages/farm-valley/src/agents/hoarder.ts` (create)
- `packages/farm-valley/src/agents/opportunist.ts` (create)
- `packages/farm-valley/src/agents/cnp-coordinator.ts` (create) — manages CNP state machines (per-task)
- `packages/farm-valley/src/agents/aggressive.test.ts` (create)
- `packages/farm-valley/src/agents/hoarder.test.ts` (create)
- `packages/farm-valley/src/agents/opportunist.test.ts` (create)
- `packages/farm-valley/src/agents/cnp-coordinator.test.ts` (create)

## Files you must NOT touch

- `packages/farm-valley/src/main.ts` — I integrate later
- `packages/farm-valley/src/components.ts` — already pre-extended with all fields you need
- `packages/farm-valley/src/world-setup.ts` — read-only
- `packages/farm-valley/src/protocols/**` — `cnp.ts` already exists with all the ontologies and bodies you need
- `packages/farm-valley/src/systems/**` — DeliberateSystem already uses the registry
- `packages/farm-valley/src/agents/conservative.ts` and `registry.ts` — read-only
- `packages/engine/**` — engine is out of scope

## What to build

### Personality semantics (from Python source)

**Aggressive** — `risk: high`, `minGoldReserve: 10`
- Picks the most profitable crop it can afford (pumpkin > corn/wheat > radish), downgrades to radish in storm/rainy weather
- Every 2 days posts inventory on the market wall at `priceMax`
- Every 2 days scans the wall for offers below 90% of shopkeeper price to undercut
- Liquidates everything to shopkeeper in the last 2 days of simulation
- For now (no end-of-sim signal yet), just skip the liquidate-last-2-days behavior — leave a one-line comment noting it
- Crop prices (use these constants for now): radish 8, wheat 14, pumpkin 35

**Hoarder** — `risk: high`, `minGoldReserve: 80`
- Always plants high-tier crops (pumpkin/corn alternating by plot id), radish only as fallback
- Acts as CNP initiator: every 3 days broadcasts a CFP (ontology `ONT_CNP.TASK`, performative `CFP`) to peers to buy radishes
- After deadline (configurable, default 2 ticks), picks cheapest proposal, sends ACCEPT (`ONT_CNP.ACCEPT`) to winner, REJECT to losers
- Also reads market wall and buys offers up to 105% of shop price, prioritized by trust score
- Use `cnp-coordinator.ts` for the CNP state machine; the personality file just *enqueues* CNP-initiate intentions

**Opportunist** — `risk: medium`, `minGoldReserve: 50`
- Crop choice driven by `beliefs.weather` forecast: wheat/radish under storm/rain, pumpkin/corn under sun
- Supply-aware market: post at fair price only when supply for that crop is low (<3 offers); otherwise dump to shopkeeper
- Buys at most one offer per day, picking highest-trust seller priced ≤110% of shop price

### Implementation notes

1. Each `deliberateXxx(farmer, ctx)` writes `Intention` objects into `farmer.intentions.queue`. Intentions are consumed by the existing `ActSystem` — but only `plant`, `buy-seed`, `sell-shopkeeper` are implemented there. **Add new intention kinds in your personality logic** that DOWNSTREAM systems will pick up:
   - `cnp-initiate` (Hoarder) — payload `{ crop, quantity, maxPricePerUnit, deadlineTick }`
   - `cnp-respond-bid` (any farmer, reactive)
   - `post-offer` (Aggressive, Opportunist) — payload `{ crop, quantity, pricePerUnit }`
   - `read-offers` — payload `{}`
   - `buy-from-wall` — payload `{ offerId, pricePerUnit }`
   These intentions will be handled by the **Game Task 03 (Market & Shop)** team's systems. **You do NOT have to implement consumers** — just enqueue them with the right shape. Use the protocol body types in `packages/farm-valley/src/protocols/market.ts` and `cnp.ts` as guidance for payload shape (mirror those bodies).

2. **Personality registration:** at the bottom of each personality file:
   ```ts
   registerPersonality("aggressive", deliberateAggressive);
   ```

3. **CNP coordinator:**
   - State per task: `{ taskId, initiatorId, status: "open" | "collecting" | "awarded" | "completed", proposals: Array<{bidderId, pricePerUnit, quantity}>, deadlineTick }`
   - Methods: `startTask(...)`, `acceptProposal(taskId, msg)`, `closeTask(taskId, currentTick)` returns the chosen winner (or null)
   - Pure data + functions, no system loop — the personality calls into it from `deliberate`
   - Deterministic winner selection: lowest `pricePerUnit`, tie-break by lowest `bidderId`

4. **Tests** — for each personality:
   - given specific beliefs/inventory, the right intentions are produced (priorities, payload shapes)
   - `cnp-coordinator.test.ts`: starts a task, accepts 3 proposals, closes after deadline, winner is the cheapest with lowest id tie-break

### Trust scores

Each farmer has `farmer.trust?.byId: Map<number, number>` (pre-added). Initial value can be 0.5 for unseen peers; you can leave actual updates as a TODO comment — the trust update belongs to a future ticket.

## Acceptance criteria

- `npm run typecheck` passes
- `npm run test -w farm-valley` passes (including your new tests)
- Each personality file registers itself via `registerPersonality(...)` at module load
- New intention kinds (`cnp-initiate`, `post-offer`, etc.) are documented in a top-of-file comment in each personality file (one line)
- No `.js` import suffixes
- No new deps

## Difficulty & subagent split

**MIXED**:
- Aggressive — easy, straightforward conditionals
- Opportunist — easy-medium, slight weather conditional logic
- Hoarder + CNP — **HARD**, multi-tick state machine, deterministic tie-break, deadline handling

Recommended split:
- **Junior (sonnet) subagent** for `aggressive.ts` + `opportunist.ts` + their tests
- **Senior (opus) subagent** for `hoarder.ts` + `cnp-coordinator.ts` + their tests
- Run them in parallel (no file overlap)
- After both return, run typecheck + test
