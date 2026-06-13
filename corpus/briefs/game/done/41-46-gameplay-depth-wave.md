# Game Briefs 41–46 — Gameplay-depth wave

**Status:** Done.
> Merged on 2026-06-13; original specs in git history.

The wave that gave the sim real economic depth: crop roster + quality tiers (the spine), livestock/orchards, greenhouse/skill progression, working NPCs + tavern, seasonal visual identity + festivals, and harbor contracts. Together they turned a flat shop-dump loop into a multi-axis economy with planning pressure, compounding returns, and calendar landmarks.

---

## 41 Crop roster + quality tiers

- Expanded crop set with season-gating: `carrot` (spring), `corn`/`tomato` (summer), `grape` (autumn), `winter-squash` (winter); crops grow full-rate in season, half-rate or not at all out of season via `seasonForDay` in `weather.ts`.
- Three quality tiers (Normal / Silver / Gold) computed at harvest: deterministic function of watering consistency, tool tier, skill level, and a forked `Rng` channel — no `Math.random`. Quality multiplies sell price (×1 / ×1.25 / ×1.5).
- `CropKind` union extended in `components.ts`; quality field added to harvested-crop inventory; `CROP_SELL_PRICE`/`SEED_COST`/`GROWTH_DAYS`/`cropSeason` in `economy.ts`; `leaderboard` in `sim-bootstrap.ts` values inventory by quality-weighted price.
- Agent planting deliberation updated per personality to weight season suitability × expected margin × affordability; `decisionTrace` reasons ("planting grapes — autumn premium").

## 42 Livestock + orchards

- Animal pens as buildable structures (`coop` → eggs, `barn` → milk/wool); herd modeled as a counter (`Pen` component: kind, count, care, fedToday) — no per-entity animals, keeping it deterministic.
- Daily `LivestockSystem` (patterned on `CropGrowthSystem`): feed/care decay, product yield, quality tied to care scalar — feeds brief 41's quality tiers. Products sell to shop; net worth in `leaderboard` counts animals/orchards/products.
- Fruit trees (`tileFeature` variants): multi-season maturation then perennial seasonal yield without replanting. Intended as the patient-capital play for conservative/hoarder personalities; aggressive personalities modeled to skip.
- Carpenter NPC given real purpose: pens and structures commissioned there (wired in brief 44).

## 43 Greenhouse + per-farm skill progression

- Greenhouse structure: expensive gold+wood/stone build, provides season-immune plots where crops grow at full rate regardless of `cropSeason`; placed via `region-setup.ts`; `Skills` component tracks farming/foraging/fishing/mining XP.
- XP awarded in `act.ts` on relevant actions; levels grant passive bonuses: farming → +quality chance / −growth time, fishing → better rarity odds, mining → better ore/geode odds, foraging → higher forage gold. Curve kept gentle for the 100-day run.
- `skills.ts` system registered in `sim-bootstrap.ts`; observer panel and `snapshot-builder.ts` expose skill levels per farmer so spectators can read why a late-game farmer is more productive.
- Conservative/hoarder personalities deliberate to build greenhouse as a high-cost patient-capital intention; `decisionTrace` reasons throughout.

## 44 Living world: working NPCs + tavern

- Carpenter validates and fulfills decoration/pen/structure orders for real: agent submits order + materials, carpenter NPC walks stations, structure delivered after a build-time delay via `work-npc.ts`. At least one personality (aggressive) wired to use it.
- Blacksmith validates tool upgrades for real: consumes ore/gold, enforces tier order, gates on materials — no longer assume-success.
- Tavern added to the village (`tavern.ts` system): barkeep NPC surfaces a daily gossip line drawn from the event feed; hiring grants a day-helper AP boost (money sink + catch-up mechanic); idle/evening farmers path to the tavern for world-alive feel.
- Notice board repurposed: posts the day's contracts/demands as a demand-side signal (natural home for brief 46 contracts).

## 45 Seasonal visual identity + festivals

- Season-variant ground tiles: `bakeStaticLayer` re-bakes on season change (4× per run) with per-season treatment — spring fresh-green, summer dry, autumn golden/orange, winter snow-dusted. Autumn/bare-winter tree variants added via recipe set.
- Weather particle overlays: rain (rainy/storm days) and snow (winter) as ambient overlays in the existing `ParticleSystem` — render-only, EDG32 palette, wall-clock animated.
- Festival calendar: four fixed days — spring (day 13), summer (day 38), autumn (day 63), winter (day 88). On festival day, farmers gather in the village; a harvest contest ranks quality submissions deterministically and awards a gold prize + standing bump; a special one-day price spike on a featured crop creates a planning opportunity.
- `daysUntilFestival`/`festivalToday` exposed by `day-clock.ts`; agents can hold back high-quality crops for the contest (`decisionTrace`: "holding Gold pumpkin for Harvest Fair"); `event-feed.ts` narrates results.

## 46 Harbor, shipping + contracts

- Harbor zone on a coastal edge with dock, cargo-ship sprite, and dockmaster NPC (`harbor.ts` system registered in `sim-bootstrap.ts`). Zone bounds + tile counts added to `regions.ts`/`region-setup.ts`; walkable-grid expected-count test updated.
- Contract board posts seeded, time-boxed contracts daily: specify good + quantity + quality tier (ties to brief 41) + deadline + gold reward (well above shop price). Fulfilling before the deadline pays out + raises `reputation` (a `components.ts` field); missing a committed contract incurs a penalty.
- Reputation is a soft progression curve: fulfilled contracts unlock bigger/better contracts, creating a demand-driven late-game axis alongside the fixed-price shop.
- Per-personality contract evaluation: aggressive overcommits for big payouts, conservative only takes safely fillable contracts, hoarder stockpiles for premium ones, opportunist watches deadlines for arbitrage. FIPA-ACL-style contract ontology in `protocols/`; `event-feed.ts` + `notice-board.ts` narrate contract outcomes.
