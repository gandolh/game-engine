---
title: "OpenTTD art-style & gameplay-feel influence (research note for both games)"
created: 2026-06-22
status: open
tags: [citadel, farm, art, ux, research, openttd-influence]
source: "OpenTTD research, 2026-06-22"
---

# OpenTTD — art-style & gameplay-feel influence

A research note, not a one-shot task. Captures what OpenTTD does aesthetically and
"in feel" that's worth borrowing, and points at the concrete mechanical briefs that
came out of the same research pass. This is the *texture/feel* half; the
*systems* half lives in:

- [2026-06-22-citadel-catchment-coverage-overlay.md](2026-06-22-citadel-catchment-coverage-overlay.md)
- [2026-06-22-citadel-two-way-service-economy.md](2026-06-22-citadel-two-way-service-economy.md)
- [2026-06-22-farm-perishability-distance-pricing.md](2026-06-22-farm-perishability-distance-pricing.md)

## Art style — what OpenTTD does

OpenTTD's base set (**OpenGFX2**) is *deliberately* classic 8-bit pixel art —
isometric, warm limited palette, evoking original Transport Tycoon. It ships two
coherent tiers: **Classic** (8-bit, 64px tiles, 1× zoom) and **High Def** (32-bit
smoother shading, 256px tiles, 4× zoom), plus NewGRF replacements like **BRIX** for
32bpp + 4× detail
([OpenGFX2](https://github.com/OpenTTD/OpenGFX2),
[32bpp graphics](https://wiki.openttd.org/en/Community/NewGRF/Playing%20with%2032%20bpp%20graphics)).
The lesson isn't "go HD" — it's that a **tight, consistent low-bit palette with
disciplined isometric volumes reads cleanly at every zoom**, and detail is layered
*on top* of a legible silhouette, never replacing it.

### What maps onto Citadel (we're already aligned — reinforce it)

Citadel already commits to **true 2:1 dimetric iso, warm terracotta roofs, a
multi-step EDG32 palette, silhouette-first forms** (see the standing art reference
[briefs/game/todo/96-citadel-building-art-style-reference.md](../briefs/game/todo/96-citadel-building-art-style-reference.md)).
OpenTTD validates that direction. Concrete borrowables:

- **Read-at-any-zoom discipline.** OpenGFX keeps types distinguishable by silhouette
  + palette role at 1× before any zoom detail. Our `ISO_ART_SCALE=1` (32-based)
  choice and the FORMS-per-type rule already chase this; treat "still legible
  zoomed out / on the minimap" as an explicit acceptance check when adding buildings.
- **Coherent palette roles, not per-building reinvention.** OpenGFX assigns fixed
  colour *roles* (roof/wall/accent) across the whole set — exactly the `SWATCH`
  role discipline in brief 96. Keep new buildings inside those roles.
- **Layered density, fixed footprint.** OpenTTD adds visual richness via props and
  shading steps on an unchanging tile footprint. Our `isoGroundProps` (barrels/
  sacks/dirt aprons) is the same move — lean into it for new types rather than
  growing footprints.

### What maps onto Farm Valley

Farm Valley is **top-down**, not iso, so OpenTTD's projection doesn't transfer
directly. The transferable part is the **palette/zoom discipline** (EDG32 is already
enforced) and the idea of **world-state legibility through art** — e.g. a building's
sprite state visibly reflecting whether it's thriving (ties to the perishability /
service-feedback briefs above). Don't chase an iso conversion.

## Gameplay feel — the "watch it grow because of me" loop

OpenTTD has **no win condition**; the pull is the feedback loop — *cities grow as you
serve them, raising demand, which rewards expanding your network*
([gameplay feel](https://steamcommunity.com/app/1536610/discussions/0/3171072251342172865/)).
The flip side: a pure sandbox "can get boring once you've survived" — players need
**self-set goals + visible consequence**.

Takeaways for us:

- **Make the world visibly react to the player.** Citadel's tier progression should
  *feel caused* — a town blooming near good service, not a threshold silently
  flipping. That's the upside loop in the
  [two-way-service-economy](2026-06-22-citadel-two-way-service-economy.md) brief.
- **Both games lean watch-it-play; give legible feedback loops, not just numbers.**
  A surfaced stat with no visible consequence is noise (same lesson as the existing
  [threat-mechanical-consequence](2026-06-19-citadel-threat-mechanical-consequence.md)
  todo). Coverage overlays, production-throttle visuals, and growth tied to service
  are all the same principle: *show cause → effect on the map.*
- **Optional soft goals.** Neither game needs a hard win condition, but OpenTTD shows
  a sandbox benefits from suggested objectives (reach Town tier, hit a net-worth
  mark) to anchor a session. Low-cost, high-retention.

## Hard constraints (unchanged)

- **EDG32 only** (guard test walks engine/games/tools); all art via `EDG.*` / the
  `SWATCH` roles in
  [palette.ts](../../games/citadel/client/src/render/sprites/palette.ts).
- Recipes stay **render-only / deterministic** — no sim impact, no import of external
  art (we *evoke*, never import; keeps "assets are code" + the licensing posture in
  brief 96).
- Citadel resolution stays 32-based (`ISO_ART_SCALE=1`); 4× was tried and reverted.

## Sources

- [OpenGFX2 base set](https://github.com/OpenTTD/OpenGFX2) ·
  [OpenTTD 32bpp graphics](https://wiki.openttd.org/en/Community/NewGRF/Playing%20with%2032%20bpp%20graphics)
- [Cargo / catchment manual](https://wiki.openttd.org/en/Manual/Cargo) ·
  [Cargo income & decay](https://wiki.openttd.org/en/Manual/Game%20Mechanics/Cargo%20income) ·
  [Production delivery](https://wiki.openttd.org/en/Manual/Production%20delivery)
- [Gameplay-feel discussion](https://steamcommunity.com/app/1536610/discussions/0/3171072251342172865/)
