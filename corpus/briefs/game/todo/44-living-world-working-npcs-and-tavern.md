# Game Task 44 — A Living World: Working NPCs, a Tavern Hub, and Useful Dead Zones

## Context

The world analysis surfaced a quality problem that's about *world design*, not content count: **the world looks busier than it is.** 18 zones exist, but the economy meaningfully uses ~6. Specifically:

- The **carpenter NPC walks between stations but does nothing** — decoration crafting exists in code but **no AI farmer ever crafts a decoration** (zero validation, zero incentive loop). The blacksmith "validates" tool upgrades but agents just *assume* success. (See [systems/work-npc.ts](../../../../packages/farm-valley/src/systems/work-npc.ts), `act.ts` upgrade path.)
- The **village has a market wall + notice board + town square but no social hub** — it's a transaction terminal, not a place.
- **Wells (2×2)** are trivial refill taps; **homes** are sleep-checks; the **notice board** is decorative.

A watched sim lives or dies on the world *feeling alive*. This brief makes existing NPCs/zones *do something* and adds one genuine social hub — high perceived-quality, mostly reusing what's there.

## Goal

### Part A — Make craft NPCs real
1. **Carpenter validates + fulfills** decoration/pen/structure orders (gives brief 42's pens and brief 41/43's structures a real crafting site): an agent submits an order + materials, the carpenter NPC walks its stations and after a short build time the structure is delivered. Wire at least one AI personality to actually *use* it (aggressive already wants decorations per its deliberation — close that loop).
2. **Blacksmith validates** tool upgrades for real (consume ore/gold, enforce tier order, gate on materials) instead of assume-success.

### Part B — A tavern / social hub in the village
3. A **tavern** structure in the village hub with a barkeep NPC. It's the social nexus the world lacks. Concrete mechanics (pick the cheap, high-flavor subset):
   - **Gossip / news**: the barkeep surfaces a daily rumor line drawn from the event feed (brief 20) — diegetic narration that makes the village feel informed.
   - **Hiring**: a farmer low on AP can pay gold for a day-helper (a temporary AP/action boost) — a money sink + a catch-up mechanic.
   - **A gathering beat**: farmers with nothing better to do (idle/evening) path to the tavern, so the hub looks populated. Pure flavor, but it's what makes a village read as alive.
4. Keep it deterministic and AP-gated; the tavern is a "spare gold/AP" sink, never a survival need.

### Part C — Repurpose dead zones (do the cheap ones)
5. **Notice board** → posts the day's **contracts/requests** (a natural home for brief 45 if that lands, or a simple "shop wants 5 wheat today for a bonus" demand line otherwise) — turns a decorative prop into a demand-side signal.
6. **A second mill / well purpose** is explicitly out of scope unless it falls out for free — don't manufacture busywork.

## Agent wiring

- Personalities gain low-priority intentions: `commission-build` (use the carpenter), `hire-help` (tavern, when AP-starved + gold-rich), and idle→tavern pathing in the evening phase ([day-phase.ts](../../../../packages/farm-valley/src/systems/day-phase.ts)). `decisionTrace` reasons.
- The carpenter/blacksmith fulfillment is a **system** reacting to order messages (model on how `ShopkeeperSystem` handles SELL), not agent logic.

## Files in scope

- `tools/atlas-builder/src/recipes.ts` — `structure/tavern` (consider a 32×48 big building), `npc/barkeep/{idle,pour-a,pour-b}`, a "helper" farmhand sprite if hiring is visual. `npm run atlas`; update frame-count test.
- `packages/farm-valley/src/systems/work-npc.ts` — carpenter/blacksmith fulfill real orders (build-time → deliver).
- `packages/farm-valley/src/systems/tavern.ts` — NEW: barkeep, gossip line (reads event feed), hiring, idle-gathering target. Registered in [sim-bootstrap.ts](../../../../packages/farm-valley/src/sim-bootstrap.ts).
- `packages/farm-valley/src/systems/act.ts` + [ap.ts](../../../../packages/farm-valley/src/systems/ap.ts) — `commission-build`, `hire-help` actions + costs; apply the day-helper boost.
- `packages/farm-valley/src/protocols/` — order/commission ontology if needed (or reuse shop/market patterns).
- `packages/farm-valley/src/world/region-setup.ts` — tavern + barkeep placement in the village; notice-board content.
- `packages/farm-valley/src/systems/notice-board.ts` — surface daily demand/contracts.
- `packages/farm-valley/src/agents/*.ts` — commission/hire/idle-gather deliberation.
- Matching `*.test.ts`: a commissioned build is delivered after build-time; a blacksmith upgrade requires + consumes materials; hiring grants the boost and costs gold; the barkeep emits a gossip line.

## Files you must NOT touch

- Engine source.
- The determinism-load-bearing tick body / scheduler ordering invariants (read the inline comments in `sim-bootstrap.ts` before inserting systems — place the tavern/work-npc systems consistently with existing ones).

## Determinism guarantee

NPC fulfillment + tavern are message/day-driven and pure given sim state; idle-gather pathing uses the existing deterministic travel. No `Math.random`/`Date.now`. `CHECK_DETERMINISM=1 npm run sim` across `0xc0ffee/1/42` + json diff. Verify replay-MATCH; update [status.md](../../../wiki/status.md) baseline.

## Acceptance

- `npm run typecheck` + `npm run test` green; palette + atlas updated.
- `npm run dev`: the carpenter actually builds a commissioned decoration/pen; a blacksmith upgrade consumes materials; the tavern is populated in the evening and shows a gossip line; the notice board shows a daily demand.
- Determinism MATCHes on replay across 3 seeds.

## Workflow

Sonnet executor. Best after briefs 41–43 (so there are structures to commission). Read `work-npc.ts`, `ShopkeeperSystem.handleSell` (the order→fulfill pattern), `day-phase.ts` (evening phase), `notice-board.ts`, `region-setup.ts`. Implement A+B and the cheap parts of C. Typecheck, test, rebake atlas, run determinism + json diff. Report files changed, test counts, baseline. Do not commit.
