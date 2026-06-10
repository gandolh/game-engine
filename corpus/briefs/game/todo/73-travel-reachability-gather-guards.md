# Brief 73 — Travel reachability: gather-beat guards + the (29,69)→shrine connectivity hole

**Status:** todo · **Area:** `packages/sim-core` (agents/watering/social.ts, travel, world grid) · **Drafted:** 2026-06-10

`[travel] no path` warn spam was diagnosed 2026-06-10 (see [open-questions.md](../../../wiki/open-questions.md) and [probe-travel-nopath.ts](../../../../tools/run-sim/src/probe-travel-nopath.ts)). The log-artifact half (`region 'undefined'` for tile-targeted intents) is already fixed; what remains are the two sim-side causes plus an engine robustness item. ⚠️ **Every task below moves the sim-outcome baseline** (even skipping a doomed intent shifts tick timing) — gate on the fast 3-day/3-seed diff *expecting divergence*, then re-verify reproducibility (self-diff MATCH) and re-probe.

## Read first

- [open-questions.md](../../../wiki/open-questions.md) — the diagnosed bullet (three causes, probe evidence).
- [agents/watering/social.ts](../../../../packages/sim-core/src/agents/watering/social.ts) — `deliberateTavernGather` / `deliberateFestivalGather` / shrine deliberation.
- [systems/travel/system.ts](../../../../packages/sim-core/src/systems/travel/system.ts) — where intents drop.
- The floodfill WASM kernel + [world/solid-connectivity.test.ts](../../../../packages/sim-core/src/world/solid-connectivity.test.ts) — prior art for connectivity checks.

## Tasks

- [ ] **1. Connectivity-component map.** Precompute (once, at world build) a land-grid component id per walkable tile (floodfill — kernel exists). Expose `sameComponent(a, b)`. Deterministic, build-time only.
- [ ] **2. Diagnose (29,69).** Dump the component map: is (29,69) a walkable pocket disconnected from the bridge network (fence/feature regression?), or is the shrine approach broken from a whole region? Fix the world data (or bridge) accordingly — Otto-3 burned 46 doomed pathfinder calls in 8 days standing there.
- [ ] **3. Reachability guard on gather/pray beats.** `deliberateTavernGather` (and the festival/shrine siblings) must skip when `!sameComponent(farmer, target)` or when the farmer is `aboard` / mid-boat-trip — this restores the behavior the brief-44 doc comment already *claims* ("gated to the village"). Update the comment to match reality either way.
- [ ] **4. (Stretch, engine) WASM pathfinder fault.** `WasmHeap.alloc` intermittently throws `RuntimeError: unreachable` under churn (caught per-intent today). Reproduce via the probe, fix the allocator (or pre-size), and remove the "intermittently traps" caveat in travel/system.ts.
- [ ] **5. Verify.** `probe-travel-nopath.ts` after: tile-target drops = 0, shrine drops = 0 on `0xc0ffee`/`1`/`42` (8 days × 1200, WASM). Full suite + typecheck. Self-diff MATCH ×3. Note the baseline move in log.md like brief 70 did.

## Acceptance

- No `[travel] no path` warnings in an 8-day × 1200-tick WASM run on the three standard seeds (pathfinder-fault warnings allowed only if task 4 is deferred — count them).
- Gather beats still fire for connected farmers (tavern fills up; don't fix the spam by killing the feature).

## Risks / notes

- Outcome baseline moves (like brief 70): record it, re-verify reproducibility, don't silently re-tune anything else in the same change.
- The reef islet is *supposed* to be land-grid-disconnected (boat-only) — the fix is guards, not a bridge to the reef.
