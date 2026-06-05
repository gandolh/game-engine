# Game Task 41 — Crop Roster Expansion + Quality Tiers

## Context

The farming loop — the *core* of a farming sim — is the thinnest part of Farm Valley's economy. There are exactly **3 crops** ([economy.ts](../../../../packages/farm-valley/src/economy.ts): radish 5g→8g/2d, wheat 8g→14g/4d, pumpkin 15g→35g/7d) and **no quality dimension** — a harvested crop is a flat count. Every farmer faces the same 3-option planting decision all 100 days, and a day-5 pumpkin is identical to a day-95 pumpkin. The genre (Stardew, Story of Seasons) treats crop variety + a **quality ladder** (Normal→Silver→Gold→Iridium) as the primary long-term depth: same crops, climbing quality, is "a long-term ladder to climb even on the same crops."

The recipe system makes this **cheap** to extend: a new crop is 3 pixel recipes (~48 chars) + 4 constants ([recipes.ts](../../../../tools/atlas-builder/src/recipes.ts) `crop/*`, `CropKind` union in [components.ts](../../../../packages/farm-valley/src/components.ts), `CROP_SELL_PRICE`/`SEED_COST`/`GROWTH_DAYS` in `economy.ts`). Scope is **bold** — this changes the determinism baseline; re-verify reproducibility, don't preserve numbers.

## Goal

### Part A — More crops, season-gated
1. **Add 4–6 crops** spanning the cost/grow/value space and **season-locked** like the genre (planting the wrong crop for the season is a wasted investment — creates planning pressure). Suggested additions (tune): `carrot` (spring, fast/cheap), `corn` (summer, multi-harvest — see C), `tomato` (summer, mid), `grape` (autumn, high/slow), `winter-squash` (winter — finally gives winter a crop), plus one premium late-game crop. Each gets 3 growth-stage sprites in the established 16×16 EDG style.
2. **Season suitability**, not hard lock to start: a crop grows full-rate in its season, **half-rate or not at all** out of season (reuse the `seasonForDay` machinery in [weather.ts](../../../../packages/farm-valley/src/systems/weather.ts)). This makes the greenhouse (brief 42) meaningful and gives each season a distinct optimal crop.

### Part B — Quality tiers
3. **Crop quality** on harvest: Normal / Silver / Gold (keep it to 3 — don't over-build). Quality multiplies sell price (e.g. ×1 / ×1.25 / ×1.5).
4. **Quality is earned, deterministically**: a function of (consistent watering / never-dried, decoration yield-boost level, tool tier, farm "skill" if brief 43 lands) + a seeded roll. No `Math.random` — fork an `Rng` channel. This rewards the husbandry the agents already do (watering reflex) with *better* product, not just *more*.
5. **Surface quality**: the crop sprite gets a small quality pip/sparkle (Stardew's star), the hover tooltip shows it, and `totalValue` (the win condition in [sim-bootstrap.ts](../../../../packages/farm-valley/src/sim-bootstrap.ts) `leaderboard`) values inventory by **quality-weighted** price.

### Part C (optional, if it falls out cheaply) — Multi-harvest crops
6. A crop like `corn`/`grape` that, once mature, **keeps producing every N days** instead of being consumed on harvest — economically superior mid-season, rewarding system knowledge (genre staple). Only do this if it doesn't balloon the brief; otherwise note it as a follow-up.

## Agent wiring

The four personalities ([agents/](../../../../packages/farm-valley/src/agents/)) currently rank a fixed `[pumpkin, wheat, radish]`-ish list. Update their planting deliberation to:
- Choose crops by **season suitability × expected margin × affordability**, flavored per personality (aggressive chases the high-value seasonal crop; conservative sticks to the safe in-season cheap one; opportunist adapts to weather forecast + which crop is in-season; hoarder picks by reserve comfort). Keep the per-personality `deliberate*` structure — don't centralize.
- Record a `decisionTrace` reason ("planting grapes — autumn premium").

## Files in scope

- `tools/atlas-builder/src/recipes.ts` — NEW `crop/<name>/{seed,growing,mature}` recipes; a quality pip/overlay if you render it as an overlay. `npm run atlas`; update the frame-count assertion in [render-systems.test.ts](../../../../packages/farm-valley/src/render-systems.test.ts).
- `packages/farm-valley/src/components.ts` — extend `CropKind`; add a `quality` field to the harvested-crop / inventory representation; `seasonSuitability` table or a helper.
- `packages/farm-valley/src/economy.ts` — `CROP_SELL_PRICE` / `SEED_COST` / `GROWTH_DAYS` for new crops; a `cropSeason(crop)` map; quality multipliers.
- `packages/farm-valley/src/systems/crop-growth.ts` — season-suitability growth-rate modifier; compute quality at harvest (seeded); multi-harvest reset if Part C.
- `packages/farm-valley/src/systems/act.ts` — harvest banks quality; mill/sell value quality-weighted; seed buy for new crops.
- `packages/farm-valley/src/systems/shop-slate.ts` / `shopkeeper.ts` — sell new seeds (respect the daily slate machinery).
- `packages/farm-valley/src/agents/*.ts` — season/quality-aware planting deliberation.
- `packages/farm-valley/src/sim-bootstrap.ts` — `leaderboard` values inventory by quality-weighted price.
- `packages/farm-valley/src/worker/snapshot-builder.ts` + tooltip in `main.ts` — crop sprite + tooltip show quality.
- Matching `*.test.ts`: a crop grows full-rate in season / reduced out of season; harvest yields a deterministic quality from the husbandry inputs; leaderboard values quality; an agent plants the in-season crop.

## Files you must NOT touch

- Engine source.
- The fishing / auction resolution logic (untouched).

## Determinism guarantee

Quality rolls use a forked seeded `Rng` channel; season/growth are pure functions of (day, plot state). After implementing, run `CHECK_DETERMINISM=1 npm run sim` across `0xc0ffee/1/42` and a multi-seed `EXPORT=json` diff to confirm reproducibility (this brief **changes outcomes by design** — verify MATCH-on-replay, not equality-to-old-baseline). Update the baseline note in [status.md](../../../wiki/status.md).

## Acceptance

- `npm run typecheck` + `npm run test` green; palette guard + atlas frame-count updated.
- `npm run dev`: agents plant a season-appropriate spread; harvested crops show quality; winter is no longer cropless; the leaderboard reflects quality.
- Determinism MATCHes on replay across 3 seeds.

## Workflow

Sonnet executor. Read `crop-growth.ts`, `economy.ts`, `seasonForDay` in `weather.ts`, one personality's planting block, and the crop recipes in `recipes.ts`. Implement A+B (C only if cheap). Typecheck, test, rebake atlas, run determinism + a json diff. Report files changed, test counts, and the new baseline. Do not commit.
