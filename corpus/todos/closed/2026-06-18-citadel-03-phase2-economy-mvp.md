---
title: "Citadel Phase 2 — roads + villagers + economy (v1 PLAYABLE)"
created: 2026-06-18
status: open
tags: [citadel, phase2, mvp, economy, roads, villagers]
---

# Phase 2 — Roads + villagers + economy  ← the MVP bar

The smallest thing that feels like the game: place road-connected buildings, villagers
walk jobs, food+materials economy runs, you can starve out. Calling this v1 "playable."

## Scope

### Buildings (7 placeables — the bread chain is in the MVP)
- **House** — provides population slots (pop cap). No worker.
- **Farm** — worker slot(s); produces **grain** per day into a local output buffer. **Seasonal:** little/no grain in winter.
- **Mill** — worker slot(s); consumes grain → produces **flour**. (First refining step + first haul-in dependency.)
- **Bakery** — worker slot(s); consumes flour → produces **bread** (the food villagers eat).
- **Woodcutter** — worker slot(s); produces **wood**. **Must be placed near forest** (terrain-locked).
- **Storehouse** — stockpile + haul target; goods become a **global pool** once stored.
- **Road** — connectivity; **drag-paint** a line of segments (placement UX upgrade from Phase 1).

### Systems
- **Road connectivity validation** (promote to `@engine/*`): on build/demolish, recompute reachability; buildings not road-connected to a storehouse don't function and are visibly flagged.
- **Job-driven villagers:** entities with a job assignment + FSM (idle → walk-to-work → work → haul-to-store → home). **Auto-assign** idle villagers to nearest open reachable job slot.
- **Hauling:** producer fills local output buffer; a hauler walks the goods **along roads** to a Storehouse; once stored, goods join the instant global pool consumers draw from.
- **Economy:** per-day production along the chain (Farm→grain, Mill→flour, Bakery→bread, Woodcutter→wood) and consumption (population eats **bread** per day). Surplus/deficit tracked per good.
- **Seasons bite:** reuse the engine 4-season cycle + visual wash. Winter: Farm grain output → ~0, so the player must build a bread/grain surplus in autumn. Defines the survival rhythm.
- **Population (pull model):** open house slots + food surplus → immigrants arrive over time; food deficit → villagers starve/leave.
- **Fail:** soft death spiral (less food → fewer workers → less food); hard game-over only at **population 0**.

### UI
- HUD: population, food + wood stockpiles, food surplus/deficit trend, day counter.
- Toolbar with the 5 placeables; drag-paint roads; demolish.
- Event feed for notable events (immigrant arrived, villager starved, building disconnected).

## Decisions (grilled 2026-06-18)
- **7-building MVP set** with the full **Farm→Mill→Bakery bread chain** — the multi-step logistics puzzle IS the game, so it's in v1 (APR #15 superseded by #23/#24). Quarry/stone + wood→planks/ore→tools refining still deferred to Phase 4.
- **Woodcutter terrain-locked near forest** (APR #22).
- **Seasons bite — winter halts farming** → autumn stockpiling rhythm is in the MVP (APR #25).
- Roads required for function; physical haul producer→store (now multiple haul legs along the chain), global pool once stored (APR #6, #18).
- Job-driven walkers, auto-assign nearest open reachable job (APR #7, #17).
- Pull-model immigration (APR #16); soft spiral, hard floor at pop 0 (APR #19).
- 20Hz tick, "day" = N ticks; per-day rates (APR #20) — tune balance numbers (incl. winter severity + chain throughput) in this phase.

## Done when
- A player can build a self-sustaining bread-chain (Farm→Mill→Bakery) + wood economy that grows population, survives winter via autumn stockpiling, and can also mismanage it into a recoverable decline and ultimately pop-0 game-over.
- Woodcutter only places near forest; resource terrain matters.
- Disconnected buildings are flagged and inert.
- Goods physically haul along roads through the chain to storehouses; consumers draw from the global pool.
- Winter visibly halts grain; a citadel with no autumn surplus starves.
- Deterministic replay holds; typecheck + palette guard pass; scoped tests for economy/immigration/connectivity green.
