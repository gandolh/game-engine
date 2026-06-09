# Game Task 53 — Remote bar (spend gold for AP)

> **SUPERSEDED (2026-06-09):** the "spend gold for AP" mechanic already exists as
> the village tavern's `hire-help`. Rather than build a duplicate bar island, the
> user chose to **improve the tavern instead** — making its AP boost land
> **same-day** (smaller boost + AP clamp) instead of next-morning. See log.md
> 2026-06-09 "Tavern AP boost → same-day". No bar island was built.

## Context

Part of the **"more islands"** theme (user request, 2026-06-09) — see
[brief 50](50-interactive-shrine-landmark.md) (shrine),
[51](51-heritage-sites-decorative-islands.md), [52](52-waterfall-island.md),
[54](54-camping-rest-island.md). The ask: an island **bar where agents consume
gold for AP**.

## ⚠️ Overlap — read before building

**This mechanic ALREADY EXISTS** as the village Tavern (brief 44): the
`hire-help` action pays gold at the tavern for an AP boost applied on the next
morning's wake (`helperHiredDay` → [perceive.ts](../../../../packages/farm-valley/src/systems/perceive.ts):165;
`hire-help` AP cost in [ap.ts](../../../../packages/farm-valley/src/systems/ap.ts):38;
[tavern.ts](../../../../packages/farm-valley/src/systems/tavern.ts);
`deliberateHireHelp`/`deliberateTavernGather` in the agents). So a "spend gold →
AP" venue is not new mechanically.

**Therefore this brief is a SCOPE DECISION, not an automatic build.** Pick one:
1. **Remote second venue (recommended if built):** a bar ISLAND that offers the
   SAME gold→AP exchange as the tavern, but located far from the village — useful
   for the far-south procedural farm band, whose farmers currently travel a long
   way to the village tavern. Real value = geography (a closer option), reusing
   the existing `hire-help` mechanic + a region gate that also accepts the bar.
2. **Different exchange:** an IMMEDIATE same-day AP top-up for gold (vs. the
   tavern's next-morning helper boost) — a distinct mechanic. Higher balance risk
   (instant AP-for-gold could let a rich leader buy dominance — watch
   [project_leader_runaway]); needs careful pricing + cooldown.
3. **Decline / fold into tavern:** decide the village tavern is sufficient and
   file this as superseded, OR just reskin: document the tavern as "the bar."

**Grill the user on which of these they want before building** — option 1 is the
cleanest "new island with real purpose"; option 2 is a genuine new mechanic that
needs balance work; option 3 avoids duplication.

## Design (assuming option 1 — remote second venue)

- New bar island region + bridge in [regions.ts](../../../../packages/farm-valley/src/world/regions.ts)
  (placed near the southern farm band so it's the closer option for those farms).
- Generalize the `hire-help` region gate so it succeeds at EITHER the village
  tavern OR the bar island (today it's village-gated — see act handler + ap.ts).
- Wire `deliberateHireHelp` to route to the NEAREST venue (tavern vs bar) by
  distance, mirroring `nearestResourceZone`.
- Reuse the existing `helperHiredDay` cooldown + AP-boost machinery unchanged so
  the economy is identical, just geographically convenient.
- Sprite: reuse `structure/tavern` or a bar variant; hover label.

## Determinism

Full rigor — it's sim surface (deliberation + region gate + gold/AP mutation).
`rng.fork(label)` never `Math.random`; verify `CHECK_DETERMINISM=1` ×3 seeds at
BOTH ticksPerDay 20 and 1200 ([project_mining_random_determinism]). The AP boost
must stay bounded + cooldown-gated so it can't amplify a leader.

## Acceptance

- typecheck + test green; guard tests (region count, no-adjacency, BFS) updated; palette/atlas if touched.
- The bar offers gold→AP; far-south farmers prefer it over the distant village tavern (verify routing).
- `CHECK_DETERMINISM` MATCH ×3 seeds @ 20 and 1200.
- Relevant wiki pages + world-generation.md updated.

## Workflow

Opus plans (START by grilling the user on options 1/2/3 above — do NOT assume),
Sonnet executes. Do not commit until asked.
