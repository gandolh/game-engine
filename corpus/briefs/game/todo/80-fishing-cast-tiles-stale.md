# Brief 80 — AI fishing dead: stale `FISHING_CAST_TILES` + a guard for the whole class

**Status:** Todo · **Area:** `packages/sim-core` (agents/watering/shared.ts, social/fishing deliberation, a new guard test) · **Drafted:** 2026-06-11

The 2026-06-09 radial reorg moved the fishing isles to `FISHING_ISLE_BOUNDS = 75–82 × 105–112` / `FISHING_ISLE_2_BOUNDS = 59–66 × 105–112` ([regions.ts:77-78](../../../../packages/sim-core/src/world/regions.ts)), but `FISHING_CAST_TILES = [(40,71),(22,71)]` ([agents/watering/shared.ts](../../../../packages/sim-core/src/agents/watering/shared.ts)) still holds the **pre-reorg** tiles. Those are now **off-isle**, so `deliberateFishing` travels AI farmers to open ground/ocean and the `fish` precondition (stand ON a fishing isle, ocean in the 4-neighbours) never passes → **AI fishing no longer fires** (the opportunist's 5-day / aggressive's 7-day side income is dead). Pip is unaffected — it checks `isFishingIsle` dynamically at action time.

This is the **same class** as [brief 73](../done/73-travel-reachability-gather-guards.md)'s tavern/festival ocean-tile fix — which corrected `TAVERN_GATHER_TILE`/`FESTIVAL_PODIUM_TILE` but **missed `FISHING_CAST_TILES`**. Root cause of the miss: `social.test.ts` guards the reachability *logic* (aboard / off-component → skip) but **never asserts the target tiles are actually valid**, so a silently-orphaned constant passes.

⚠️ **Baseline-mover.** AI fishing resuming changes the economy → the sim-outcome baseline shifts (like brief 73). Gate on the fast 3-day/3-seed `EXPORT=json` diff *expecting divergence*, then re-verify reproducibility (self-diff MATCH ×3). **Per the resource rule, ask the user before running the check.**

## Read first
- [agents/watering/shared.ts](../../../../packages/sim-core/src/agents/watering/shared.ts) — `FISHING_CAST_TILES` (+ the now-correct `TAVERN_GATHER_TILE`/`FESTIVAL_PODIUM_TILE` for the pattern).
- `deliberateFishing` (in [agents/watering/](../../../../packages/sim-core/src/agents/watering/)) — the only consumer; confirm via grep it's the sole usage.
- [regions.ts](../../../../packages/sim-core/src/world/regions.ts) — `FISHING_ISLE_BOUNDS`, `isFishingIsle`, `isWalkable`, `FISHING_ISLE_IDS`.
- [social.test.ts](../../../../packages/sim-core/src/agents/watering/social.test.ts) — the existing reachability-logic guards (extend, don't duplicate).
- [open-questions.md](../../../wiki/open-questions.md) + [player-and-interaction.md](../../../wiki/player-and-interaction.md) → Fishing — the diagnosis.

## Tasks
- [ ] **1. Derive the cast tiles, don't hardcode them.** Replace the literal `FISHING_CAST_TILES` with a value computed once from `FISHING_ISLE_IDS` + bounds: for each isle, scan its tiles deterministically (e.g. ascending y then x) and pick the first that is on-isle (`isFishingIsle`) **and** has an ocean 4-neighbour (`!isWalkable`). This makes the constant self-correcting across any future reorg. Keep it a module-level const (computed at load, pure) so callers are unchanged.
- [ ] **2. Class-level guard test** (`shared.test.ts` or extend `social.test.ts`): assert **every** AI travel-target tile is valid in the live world — `FISHING_CAST_TILES` each `isFishingIsle` + has an ocean neighbour; `TAVERN_GATHER_TILE` + `FESTIVAL_PODIUM_TILE` each `isWalkable` and in the expected region (`regionAt` = village / town-square). This is the test whose absence let the bug through; it must fail on a stale literal.
- [ ] **3. Verify.** Confirm `deliberateFishing` now sends a farmer to a real isle and a cast fires (a focused unit test, or a short probe). Fast 3-day/3-seed `EXPORT=json` diff: expect DIVERGENCE from the current baseline (fishing resumed), then self-diff MATCH ×3 (reproducible). typecheck + full suite. Note the baseline move in log.md like brief 73.

## Acceptance
- AI fishing fires live again (opportunist/aggressive reach a fishing isle and cast); the new guard test fails if any gameplay-target tile is moved off its region.
- Reproducibility holds (self-diff MATCH ×3); the outcome-baseline move is recorded, not silently re-tuned.

## Risks / notes
- Sole consumer is `deliberateFishing` — confirm with grep before changing the shape.
- Don't widen scope to "audit every `*_TILE`": the render/world-setup tiles (`BLACKSMITH_TILE`, `WATERFALL_TILE`, …) are visually load-bearing and already correct; only the **AI-travel-target** tiles fail silently. The guard test can cheaply cover them anyway.
- The reef `CORAL_REEFS` (boat fishing) are a separate path — out of scope unless the probe shows coral fishing is also dead.
