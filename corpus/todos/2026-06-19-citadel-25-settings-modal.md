---
title: "Citadel 25 — Settings modal (tabs, a11y, keyword search)"
created: 2026-06-19
status: open
tags: [citadel, ui, ux, chrome]
---

# Citadel 25 — Settings modal

**Lineage:** tiny-world-builder's settings skill — a modal with tabbed categories
(Workspace/Rendering/World/Materials/Environment/Crowd/AI), semantic `role=tab`/`role=tabpanel`,
Arrow/Home/End keyboard nav, `data-settings-keywords` attributes for search, grouped by user
intent (not implementation), mobile-responsive with internal scroll.

**Target:** Citadel client UI — [main.ts](../../packages/citadel/src/main.ts) DOM overlay. **UI-only.**

## Idea

A proper settings modal for Citadel: speed/zoom, and **render toggles** for the new atmosphere
layers — day/night ([citadel-15](2026-06-19-citadel-15-daynight-wash-light-pool.md)), weather
([citadel-16](2026-06-19-citadel-16-weather-particle-fx.md)), ambient crowd
([citadel-18](2026-06-19-citadel-18-instanced-ambient-crowd.md)) — grouped by intent,
keyboard-navigable, searchable.

## Priority / sequencing

Pure chrome — **lower leverage** than the gameplay/legibility/atmosphere items. Most valuable
**after** the render-toggle features (15/16/18) exist, since the modal's main job is toggling
them. The immediate UX gaps (tier-gating buttons, mode chip, Escape-to-cancel) are higher-leverage
and live elsewhere.

## Acceptance

- Accessible tabbed settings modal (role=tab, keyboard nav, keyword search), mobile-responsive.
- Toggles wired to the render features; any colour via `EDG.*`.
- UI-only; no sim change; typecheck + tests green.
