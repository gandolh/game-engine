# Game Task 46 — Harbor, Shipping & Contracts (a new playstyle axis)

## Context

Farm Valley is an **archipelago surrounded by ocean** — yet the ocean does nothing but gate fishing and host bridges. The world analysis flags **harbor/shipping** as the most thematically obvious missing system: it "explains why farming is isolated on islands." More importantly for *design*, it adds a **playstyle axis the game lacks**: today everyone wins the same way (grow → dump to the fixed-price shop → highest `totalValue`). A contract/shipping economy adds a **demand-driven, planning-heavy** way to make money that rewards foresight and specialization over raw volume — exactly the kind of strategic divergence that makes four AI farmers interesting to watch compete (Civ4 AI Survivor: asymmetric paths drive re-watching; My Time at Portia's commission board is the genre reference).

This also indirectly fixes the "fixed shop price = no scarcity" flatness (which the user chose not to tackle head-on): **contracts create time-boxed demand spikes** for specific goods, so *what* and *when* you produce starts to matter.

Bold scope, net-new system, but it reuses the message-bus/order patterns already in `ShopkeeperSystem`/`MarketSystem`.

## Goal

### Part A — The harbor
1. A **harbor** zone/structure on a coastal edge of the village (or its own small island) with a **dock + a shipping NPC and a periodically-arriving cargo ship** sprite. The ship is the diegetic anchor for shipping.

### Part B — Contracts (the core)
2. A **contract board** (host on the harbor, or repurpose the dead notice board from brief 44): each day/few-days the harbor posts **contracts** — "ship 8 Gold-quality wheat within 4 days for 180g + standing." Contracts are seeded, time-boxed, and specify good + quantity + quality (ties to brief 41) + deadline + reward (gold, well above shop price).
3. **Fulfilling** a contract: a farmer brings the goods to the dock before the deadline → big payout + a **standing/reputation** bump. Missing a committed contract → a penalty (reputation or forfeit). This is the demand-side the fixed-price shop never provided — and it makes high-quality production (briefs 41/42/43) suddenly *valuable on a schedule*.
4. **Reputation** as a soft secondary currency: fulfilled contracts raise harbor standing, which unlocks bigger/better contracts — a clean late-game progression curve and a money sink-free way to differentiate the leaders.

### Part C (optional) — Bulk export
5. If cheap: a passive "export surplus" option — dump excess inventory to the ship at a **bulk discount** (below shop price but unlimited and instant), giving overproducers an outlet and creating a real "is it worth growing more?" decision. Otherwise note as follow-up.

## Agent wiring

- Personalities evaluate open contracts vs. their production capacity and risk profile: aggressive chases big contracts (overcommits, accepts forfeit risk); conservative only takes contracts it can safely fill; hoarder stockpiles to fill premium ones; opportunist watches deadlines for arbitrage. A `commit-contract` / `deliver-contract` intention pair. `decisionTrace` reasons throughout — contracts make the "why" panel rich ("committed to wheat contract, deadline day 34").
- Contract selection/commitment is per-personality deliberation; **resolution** (payout, deadline checks, reputation) is a deterministic system.

## Files in scope

- `tools/atlas-builder/src/recipes.ts` — `structure/dock`, `structure/cargo-ship` (likely a big multi-tile sprite like forge-house), `npc/dockmaster/*`, contract-board dressing. `npm run atlas`; update frame-count test.
- `packages/farm-valley/src/world/regions.ts` + `region-setup.ts` — harbor zone bounds + dock/ship/NPC placement + bridge/road wiring; update the walkable-grid expected-count test (the world-layout tests assert exact tile counts — update together).
- `packages/farm-valley/src/systems/harbor.ts` — NEW: contract generation (seeded, time-boxed), commitment tracking, deadline + delivery resolution, reputation. Registered in [sim-bootstrap.ts](../../../../packages/farm-valley/src/sim-bootstrap.ts).
- `packages/farm-valley/src/protocols/` — contract ontology (CFP-like; mirrors the FIPA-ACL style already used).
- `packages/farm-valley/src/components.ts` — `reputation` on farmers; committed-contract state.
- `packages/farm-valley/src/economy.ts` — contract reward tables, reputation tiers.
- `packages/farm-valley/src/systems/act.ts` + [ap.ts](../../../../packages/farm-valley/src/systems/ap.ts) — `commit-contract`, `deliver-contract` (+ `export-bulk` if Part C).
- `packages/farm-valley/src/agents/*.ts` — contract evaluation/commitment per personality.
- `packages/farm-valley/src/sim-bootstrap.ts` — optionally factor reputation into net worth / surface separately.
- `packages/farm-valley/src/systems/event-feed.ts` + `notice-board.ts` — narrate contracts posted/fulfilled/missed (drama-scored, brief 38).
- Matching `*.test.ts`: a contract generates deterministically; delivering before the deadline pays out + raises reputation; missing it penalizes; a personality commits to an affordable contract; walkable-grid count updated for the harbor.

## Files you must NOT touch

- Engine source.
- The crop/fishing/auction *resolution* (read crop quality for contracts; don't rewrite them).

## Determinism guarantee

Contract generation + resolution are seeded/day-driven and pure given sim state. No `Math.random`/`Date.now`. `CHECK_DETERMINISM=1 npm run sim` across `0xc0ffee/1/42` + json diff. Changes outcomes by design — verify replay-MATCH; update [status.md](../../../wiki/status.md) baseline and the walkable-grid count.

## Acceptance

- `npm run typecheck` + `npm run test` green; palette + atlas + walkable-grid count updated.
- `npm run dev`: the harbor posts contracts; farmers commit and deliver (or miss) before deadlines; reputation grows; a cargo ship visits; the feed narrates contract outcomes; high-quality production has a clear premium buyer.
- Determinism MATCHes on replay across 3 seeds.

## Workflow

Sonnet executor. Best after brief 41 (contracts reference crop quality) and ideally 44 (reuses the notice board / NPC-fulfillment pattern). Read `ShopkeeperSystem` + `MarketSystem` (order/offer patterns), the CNP protocol in `protocols/`, `regions.ts`/`walkable-grid.test.ts` (adding a zone), and one personality's market block. Implement A+B (C if cheap). Typecheck, test, rebake atlas, run determinism + json diff. Report files changed, test counts, baseline. Do not commit.
