---
title: "Farm Valley UI — Shop window not tall enough; pumpkin entry rendered outside the window"
created: 2026-07-15
status: closed (2026-07-16, `8de2572` — LIST_HEIGHT fit 4 of 5 rows; no clipping in the box-mirror list)
tags: [farm, ui, bug]
---

# Shop window isn't tall enough — pumpkin is out of the window

The Shop window's height is too small for its content: the pumpkin entry (last
item in the list) is drawn outside/below the window bounds.

## Context

- Either the window height should grow to fit the item list, or the list needs
  clipping + scrolling — pick whichever matches the existing @engine/ui panel
  conventions ([wiki/player-and-interaction.md](../wiki/player-and-interaction.md)).
- Check whether the height is a hardcoded constant that fell behind when a new
  item (pumpkin) was added to the shop inventory.

## Acceptance

Every shop item, including pumpkin, renders fully inside the Shop window.

## Resolution (2026-07-16)

Confirmed the suspected hardcoded constant: `slate-billboard.ts` `LIST_HEIGHT = 200` fit only 4
of the 5 fixed `SLATE_SIZE` offer rows (~49px each), and the same `.layout`-reassignment bug as the
Farmers flicker dropped `gap: 0`, adding a stray 4px per row. Since the mirror list is a plain box
(not a real ScrollViewportNode) nothing clips, so the 5th offer drew fully outside the panel.
Fix: LIST_HEIGHT 200 → 250 (all 5 fit), layout props merged, strict bottom-edge cull added.
Regression test asserts all 5 offers stay inside the panel's laid-out bounds. Browser-verified with
the day's full 5-offer slate.
