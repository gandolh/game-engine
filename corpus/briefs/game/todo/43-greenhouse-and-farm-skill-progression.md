# Game Task 43 — Greenhouse + Per-Farm Skill Progression

## Context

Two genre-defining progression mechanics are missing, and they pair naturally:

1. **No off-season growing.** With brief 41's season-locked crops, winter (and each off-season) becomes dead farming time. The genre's answer is the **greenhouse** — a major mid/late-game unlock that lets any crop grow year-round, "one of the defining mid-game progression milestones." It converts a hard seasonal wall into a *resource tradeoff* (build it, then farm premium crops perpetually).

2. **Progression is shallow and uni-axial.** The only compounding levers today are tool tiers, decorations (+75% yield cap), plot count, and the growing AP budget — all "more of the same." There's no **skill** that makes a farmer *better at farming over time*. The genre uses skill levels (Stardew's Farming/Foraging/Fishing/Mining, each 10 levels, with profession choices) as the main "I've grown" signal and a replayability lever.

Bold scope. Both touch core economy; re-verify, don't preserve numbers.

## Goal

### Part A — Greenhouse
1. A buildable **greenhouse** structure on a farm: expensive (gold + wood/stone, or a late-game milestone gate), gives a small block of **season-immune plots** — crops inside grow at full rate regardless of `cropSeason` (brief 41). Distinct floor tile + a glasshouse sprite.
2. The clear late-game money sink: it pays back by enabling out-of-season premium crops, so building it is a real strategic decision (when can I afford it / is the run long enough to amortize it).

### Part B — Per-farm skills
3. A small **skill** vector per farmer (start with `farming`, `foraging`, `fishing`, `mining` — the activities that already exist), each leveling from **doing the activity** (XP on plant/harvest, forage, fish, mine).
4. Levels give **passive compounding bonuses**: e.g. farming level → +quality chance (ties to brief 41) and/or −growth time; fishing level → better rarity odds; mining level → better ore/geode odds; foraging level → higher forage gold. Keep the curve gentle (the run is 100 days).
5. **Profession-style fork (optional, if cheap):** at a milestone level, a one-time deterministic choice per personality (e.g. aggressive→"volume", conservative→"quality") that flavors the bonus. This is a replayability lever — different personalities specialize differently. If it balloons the brief, ship just the linear skill bonuses and note professions as a follow-up.
6. **Surface it**: the observer panel shows each farmer's skill levels (legibility — the spectator sees *why* a late-game farmer is so productive). Feeds the end-of-run recap (brief 36) — "Otto maxed Fishing."

## Agent wiring

- Skills are **earned automatically** by the activities agents already do — no new agent decision needed for Part B's core. Personalities may *weight* toward their strong skill (aggressive over-farms → high farming; opportunist diversifies → spread skills), which already happens via their existing activity mix.
- Greenhouse build is a new high-cost intention; conservative/hoarder (patient capital) favour it, aggressive may skip. `decisionTrace` reasons.

## Files in scope

- `tools/atlas-builder/src/recipes.ts` — `structure/greenhouse` (could be a 32×48 big structure like the forge-house) + `tile/greenhouse-floor`. `npm run atlas`; update frame-count test.
- `packages/farm-valley/src/components.ts` — `Skills` component (4 counters + level helper); greenhouse plot flag.
- `packages/farm-valley/src/economy.ts` — greenhouse cost, skill XP curve + bonus tables.
- `packages/farm-valley/src/systems/skills.ts` — NEW: award XP on the relevant ACT outcomes (or fold XP grants into `act.ts` and keep level/bonus math here, pure + tested). Registered in [sim-bootstrap.ts](../../../../packages/farm-valley/src/sim-bootstrap.ts).
- `packages/farm-valley/src/systems/act.ts` — grant XP; greenhouse plots ignore season; apply skill bonuses to quality/growth/rarity/forage where those resolve.
- `packages/farm-valley/src/systems/crop-growth.ts` — greenhouse plots full-rate any season; farming-skill growth/quality bonus.
- `packages/farm-valley/src/world/region-setup.ts` — greenhouse placement on a farm.
- `packages/farm-valley/src/agents/*.ts` — greenhouse build deliberation.
- `packages/farm-valley/src/ui/observer.ts` + `worker/snapshot-builder.ts` — show skill levels per farmer.
- Matching `*.test.ts`: a greenhouse plot grows an out-of-season crop at full rate; doing an activity raises its skill and the bonus applies; observer reflects levels.

## Files you must NOT touch

- Engine source.
- Fishing/auction resolution beyond applying a skill rarity bonus.

## Determinism guarantee

XP/levels/bonuses are pure functions of activity counts; any roll uses a forked seeded `Rng`. `CHECK_DETERMINISM=1 npm run sim` across `0xc0ffee/1/42` + json diff. Changes outcomes by design — verify replay-MATCH; update [status.md](../../../wiki/status.md) baseline.

## Acceptance

- `npm run typecheck` + `npm run test` green; palette + atlas updated.
- `npm run dev`: a farmer builds a greenhouse and grows out-of-season; skills visibly level over the run and late-game farmers are measurably more productive; observer shows levels.
- Determinism MATCHes on replay across 3 seeds.

## Workflow

Sonnet executor. Sequence after brief 41 (greenhouse needs season-locked crops; skills boost quality). Read `crop-growth.ts`, the AP/act flow, `region-setup.ts` build placement, `observer.ts`. Implement A+B (professions only if cheap). Typecheck, test, rebake atlas, run determinism + json diff. Report files changed, test counts, baseline. Do not commit.
