---
title: "Citadel UI — personalize walking entities by job + click to show their job"
created: 2026-06-28
status: todo
tags: [citadel, ui, art, villagers, cozy-pivot]
---

# Personalize villagers by job; click a villager to see its job

> **UNBLOCKED 2026-06-30** — `@engine/ui` shipped ([brief 17](../briefs/engine/done/17-engine-ui-framework.md)); build this panel native to it (`@engine/ui` widget tree + the Citadel HUD pattern in `games/citadel/client/src/ui/resource-hud.ts`), not DOM. Depends on
> [render-all-gui-in-game / @engine/ui](2026-06-28-citadel-ui-all-rendered-in-game.md).
> The **sim half** (a `job` snapshot field) and the **per-job sprite art** have no UI
> dependency and can proceed now.

Walking villagers should **look like the job they do** (a baker reads as a baker, a
woodcutter as a woodcutter), and **clicking one** should show what job it has.

This directly serves the cozy-pivot **watch-it-live** heart (secondary heart, decision
#2 of [the cozy-pivot build order](2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md)) — the
town is more alive and more *legible* when you can read a villager's role at a glance.

## ⚠️ Prerequisite — villagers carry no job in the snapshot today
The villager snapshot has only `fsm` (state: work/idle/travel —
[snapshot/index.ts:38](../../games/citadel/sim-core/src/snapshot/index.ts#L38)) and no
**job/workplace-type** field. So:

1. **Sim: expose each villager's job.** A villager is assigned to a workplace by
   `villager-system.ts`; surface that workplace's **building type** (or a derived
   `job` enum: farmer/miller/baker/woodcutter/quarryman/smith/trader/…) as a read-only
   snapshot field. Read-only → determinism untouched.

2. **Render: per-job appearance.** Today villagers are a grey-ramp `vil/person`
   silhouette tinted by FSM state ([quads.ts:276](../../games/citadel/client/src/render/quads.ts#L276)
   `VILLAGER_COLORS[v.fsm]`). Differentiate by **job** — at minimum a per-job tint/accent
   (apron, tool, hat); ideally a small per-job sprite accent. EDG32 via `SWATCH`. Keep it
   cheap (one base figure + job accent), in the spirit of the ambient-crowd tinting.
   *Note:* this layers under the cozy-pivot **per-villager mood** (Phase E) — coordinate
   so job-appearance and mood-tint compose rather than fight (e.g. job = shape/accent,
   mood = posture/desaturation).

3. **Click → job label.** Clicking a villager (today: follow-cam lock,
   [main.ts:312](../../games/citadel/client/src/main.ts#L312)) also surfaces its job
   (a small label/badge, or fold into the follow-HUD `#follow-hud`).

## Acceptance
- Villagers visually read by job; clicking one shows its job. EDG32 + tests green;
  determinism untouched (snapshot field is a read-only derive).
