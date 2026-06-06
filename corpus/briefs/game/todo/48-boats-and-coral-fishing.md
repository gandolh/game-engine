# Game Task 48 — Boats & Coral Fishing (the ocean becomes a place to go)

## Context

Farm Valley is an archipelago, but fishing today happens from the shore — the ocean is a backdrop you cast into, not somewhere a farmer travels. Brief 46 added the harbor and a cargo ship as diegetic anchors; this brief gives each farmer their **own boat** and a reason to use it: **rowing out to coral reefs that hold special, high-value fish** unavailable from the shoreline. It deepens the fishing skill axis (brief 43 progression) and adds a spatial/planning decision — is the trip out worth it? — that rewards farmers who specialize in fishing.

## Goal

1. **A boat per farm.** Each farmer's farm gets a small docked boat (a tile/structure at a coastal edge of their plot). The boat is the farmer's vehicle for reaching open water.
2. **Boarding & travel.** A farmer can board their boat and travel across water tiles to reach **coral reef spots** out in the ocean (pathfinding over water while aboard; back to land-walking when they disembark). The boat is the only way to reach the corals.
3. **Coral reefs = special fish.** Seed a handful of **coral spots** in the open ocean. Fishing at a coral yields a distinct, rarer, higher-value **special fish** species not catchable from shore — the payoff that justifies the trip.
4. **The trip is a decision.** Travel time + the value premium of coral fish should make "row out to the reef" a real choice a personality weighs against staying home to farm.

## Agent wiring

- Personalities evaluate a coral-fishing trip vs. their current best intention: a fishing-leaning / opportunist farmer values the special-fish premium and takes the trip; a conservative farmer only goes when farm chores are clear; aggressive may chase it for the high-value catch. New intention(s): `board-boat` / `travel-to-coral` / `fish-coral` / `return-to-shore` (or a compact equivalent).
- `decisionTrace` should narrate the reasoning ("rowing to coral reef — special fish worth the trip, deadline-free").
- Boat travel + coral catch *resolution* is a deterministic system; the *choice* to go is per-personality deliberation.

## Files in scope (verify before editing — paths may have drifted)

- `tools/atlas-builder/src/recipes.ts` (or the split sheets from brief 47) — `structure/boat` (docked + in-water frames), `terrain/coral` reef tile, special-fish item icon(s). `npm run atlas`; update frame-count test.
- `packages/farm-valley/src/world/regions.ts` + `region-setup.ts` — per-farm boat placement; coral spot placement in open water; update the walkable-grid expected-count test (it asserts exact tile counts — update together). Decide whether water becomes conditionally-walkable-when-aboard in the grid or is handled as a separate boat-travel mode.
- `packages/farm-valley/src/world/` pathfinder usage — boat travel over water tiles (the pathfinder is land-grid today; either a water cost layer or a separate aboard-state traversal). Engine pathfinder source is **off-limits** — do this in game code / grid config.
- `packages/farm-valley/src/components.ts` — boat ownership/state on a farmer (aboard? boat entity?), boat entity components.
- `packages/farm-valley/src/systems/` — NEW boat/coral system (boarding, water travel, coral fishing resolution); register in [sim-bootstrap.ts](../../../../packages/farm-valley/src/sim-bootstrap.ts) in the right order (after Perceive, alongside the existing fishing system).
- existing fishing system — read for the catch/loot pattern; coral fishing reuses it with a special-fish loot table.
- `packages/farm-valley/src/economy.ts` — special-fish values (premium over shore fish).
- `packages/farm-valley/src/agents/*.ts` — coral-trip evaluation per personality.
- `packages/farm-valley/src/systems/event-feed.ts` — narrate a notable coral catch (drama-scored, brief 38).
- Matching `*.test.ts`: a farmer boards and reaches a coral deterministically; coral fishing yields a special fish; a fishing-leaning personality elects the trip; walkable-grid / atlas counts updated.

## Files you must NOT touch

- Engine source (incl. the WASM/JS pathfinder kernels — configure cost/grid from game code instead).
- The existing shore fishing *resolution* — reuse it, don't rewrite it.

## Determinism guarantee

Boat travel, coral spot seeding, and special-fish loot are seeded/sim-state-pure. **No `Math.random` / `Date.now`** (see [project_mining_random_determinism] — raw random in ACT paths is a known nondeterminism bomb; verify at the default `TICKS_PER_DAY`, not just 1200). `CHECK_DETERMINISM=1 npm run sim` across `0xc0ffee/1/42` + json diff. Changes outcomes by design — verify replay-MATCH and update the [status.md](../../../wiki/status.md) baseline + walkable-grid count.

## Acceptance

- `npm run typecheck` + `npm run test` green; palette + atlas + walkable-grid count updated.
- `npm run dev`: each farm has a boat; a farmer boards, travels to a coral reef, catches a special fish, returns; the feed narrates a notable catch; the trip is a visible per-personality choice in `decisionTrace`.
- Determinism MATCHes on replay across 3 seeds.

## Workflow

Sonnet executor. Best after brief 43 (fishing progression) and 47 (atlas split — add the boat/coral/special-fish art to the right sheet). Read the existing shore-fishing system, the pathfinder/grid setup (`regions.ts` / `walkable-grid.test.ts`), and one personality's activity-selection block. Open question to resolve early: **how the boat traverses water** — conditional grid walkability vs. a separate aboard traversal mode — pick the simplest that stays deterministic and keeps engine source untouched. Implement, typecheck, test, rebake atlas, run determinism + json diff. Report files changed, test counts, baseline. Do not commit.
