# Game Task 42 — Livestock Pastures + Orchards (a slow-burn parallel playstyle)

## Context

Farm Valley is **all annual crops**. The genre's second pillar — **animal husbandry** and **perennials** — is entirely absent, and the world analysis flags it as the most natural missing content for a farming archipelago. This matters for *design*, not just content: livestock and orchards are a **slow-burn parallel income stream** that compounds differently from crops (upfront cost + ongoing care → passive daily yield), which gives personalities a genuinely different *strategy* to diverge on rather than just different tactics on the same crop loop. (Sources: Stardew animal affection→product-quality; the genre's "maker chain" value multiplication.)

Bold scope: this is net-new systems (new components, a daily-yield system, agent decision logic) but it reuses existing patterns (daily-tick systems like `CropGrowthSystem`, zone-gated activities, the `decoration` yield-boost precedent). Trees already exist as lumber features — orchards are the same idea with fruit output.

## Goal

### Part A — Livestock (counter-based, low-fidelity)
1. **Animal pens** as a buildable farm structure (like decorations): a `coop` (chickens → eggs) and a `barn` (cows → milk / sheep → wool). Built at the carpenter (gives the cosmetic carpenter NPC a real job — see brief 44) for wood + gold.
2. **Herd as a counter**, not individual entities (keep it cheap + deterministic): a pen holds `N` animals; each fed+tended day produces `N × productYield` of its product into inventory. **Affection/care** = a simple per-pen `care` scalar raised by a daily `tend` action and decayed by neglect; high care → higher product **quality** (ties into brief 41's quality tiers) and/or yield.
3. **Products feed the economy**: eggs/milk/wool sell to the shop and (Part C) process into higher-value goods.

### Part B — Orchards (perennial trees)
4. **Fruit trees** planted on farm tiles: a multi-day **maturation** (much slower than crops — a multi-season investment), then **perennial seasonal yield** (e.g. apple in autumn, cherry in spring) every year-cycle without replanting. Reuse the `tileFeature` tree rendering; add fruit-bearing variants with 2–3 growth sprites.
5. Orchards are the **patient-capital play**: expensive + slow, but free yield once established — exactly the kind of bet a *conservative* or *hoarder* personality should favour and an *aggressive* one should skip.

### Part C (optional) — Processing / maker chain
6. If it fits: milk→cheese, wool→cloth, fruit→preserves at a maker building (or extend the mill). Processing multiplies value at the cost of time+AP — the genre's signature mid-game value engine. Otherwise note as a follow-up brief.

## Agent wiring

- Personalities decide whether to invest in livestock/orchards per their risk profile (patient vs. fast-turnover). Add deliberation: build pen / buy animal / tend / plant orchard / harvest fruit, prioritized below survival-farming. Conservative + hoarder lean in; aggressive prioritizes crop volume; opportunist diversifies. `decisionTrace` reasons throughout.
- These are **low priority** intentions (AP pruner drops them on busy days) so they're "compounding side investment," not a survival need.

## Files in scope

- `tools/atlas-builder/src/recipes.ts` — NEW sprites: `structure/coop`, `structure/barn`, animal sprites (`animal/chicken`, `animal/cow`, `animal/sheep` — small, can be static or 2-frame idle), fruit-tree growth stages + fruit-laden variants, product inventory icons (`product/egg`, `product/milk`, `product/wool`, `fruit/*`). `npm run atlas`; update frame-count test.
- `packages/farm-valley/src/components.ts` — `Pen` component (kind, count, care, fedToday); orchard tile-feature variant; products + fruits in `inventory`.
- `packages/farm-valley/src/economy.ts` — prices/yields/care-decay/maturation constants for animals, products, fruit.
- `packages/farm-valley/src/systems/livestock.ts` — NEW daily-tick system (model on `CropGrowthSystem`): feed/care decay, daily product yield, quality from care. Registered in [sim-bootstrap.ts](../../../../packages/farm-valley/src/sim-bootstrap.ts).
- `packages/farm-valley/src/systems/orchard.ts` — NEW (or fold into `crop-growth.ts`/`tile-features.ts`): perennial maturation + seasonal fruit drop.
- `packages/farm-valley/src/systems/act.ts` — new actions: `build-pen`, `buy-animal`, `tend`, `plant-tree`, `harvest-fruit`, `collect-product`; AP costs in [ap.ts](../../../../packages/farm-valley/src/systems/ap.ts).
- `packages/farm-valley/src/world/region-setup.ts` — pens placed on farms; orchards plantable on farm tiles.
- `packages/farm-valley/src/agents/*.ts` — investment deliberation per personality.
- `packages/farm-valley/src/sim-bootstrap.ts` — `leaderboard` values animals/orchards/products in net worth.
- Matching `*.test.ts`: a fed pen yields product next day; neglect decays care + quality; an orchard matures then drops fruit in its season; net worth counts the assets; a personality builds a pen.

## Files you must NOT touch

- Engine source.
- Existing crop/fishing/auction resolution (additive only).

## Determinism guarantee

All new systems are day-boundary deterministic; any roll uses a forked seeded `Rng`. Run `CHECK_DETERMINISM=1 npm run sim` across `0xc0ffee/1/42` + a json diff. This changes outcomes by design — verify replay-MATCH; update the baseline note in [status.md](../../../wiki/status.md).

## Acceptance

- `npm run typecheck` + `npm run test` green; palette + atlas updated.
- `npm run dev`: at least one personality builds a coop/barn and collects daily product; an orchard matures and fruits; net worth reflects the assets; the carpenter has a reason to exist (pens crafted there).
- Determinism MATCHes on replay across 3 seeds.

## Workflow

Sonnet executor. Sequence after (or alongside) brief 41 — products/fruit reuse its quality tiers. Read `CropGrowthSystem` (daily-tick pattern), the `decoration` build path in `act.ts`, `tile-features.ts` (tree features), and `region-setup.ts`. Implement A+B (C if cheap). Typecheck, test, rebake atlas, run determinism + json diff. Report files changed, test counts, baseline. Do not commit.
